"""Blender -b assets/blender/hsad_glove.blend -P this_file -- path/to/layout.json
Register the glove to the photographed FPC, preserving the photograph's XY scale.
"""
import json
import sys
from math import radians
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path(__file__).resolve().parents[2]
parts = json.loads(Path(sys.argv[-1]).read_text(encoding="utf8"))
rig = bpy.data.objects["HandRoot"]
shell = bpy.data.objects["HandMesh"]
cuff = bpy.data.objects["Wrist_binding"]
old_meta = {o.name:dict(o.items()) for o in bpy.context.scene.objects if o.name.startswith("Sensor_")}
keep = {rig,shell,cuff,bpy.data.objects["HSAD_Metadata"]}
for obj in list(bpy.context.scene.objects):
    if obj not in keep:
        bpy.data.objects.remove(obj,do_unlink=True)

# A single isotropic scale and origin for every photographed trace and package.
def xy(uv):
    return (np.asarray(uv)-[215,610])*[1/110,-1/110]+[0,.40]


# Register the support and joint axes to the photo, rather than stretching the circuit.
landmarks = {
 "Index": [(343,523),(359,321),(370,202),(375,111)],
 "Middle":[(246,507),(258,283),(265,165),(269,72)],
 "Ring":  [(155,518),(155,305),(156,190),(156,102)],
 "Little":[(73,537),(73,369),(71,263),(69,182)],
 "Thumb": [(408,765),(509,670),(619,530),(688,442)],
}
source, target = [],[]
for finger, pixels in landmarks.items():
    suffixes = ("CMC","MCP","IP") if finger=="Thumb" else ("MCP","PIP","DIP")
    chain = [rig.data.bones[f"{finger}_{s}"] for s in suffixes]
    source += [list(b.head_local)[:2] for b in chain]+[list(chain[-1].tail_local)[:2]]
    target += list(xy(pixels))
for coord, pixel in [((-.9,-2.65),(118,908)),((1,-2.65),(358,908)),((0,-1.5),(219,812)),
    ((-1.23,-1.1),(49,779)),((1.38,-.92),(396,754)),((0,.1),(218,641)),
    ((-1.41,.15),(43,636)),((1.42,.18),(386,632))]:
    source.append(coord)
    target.append(xy(pixel))
src=np.array(source)
def radial(p):
    d=np.sum((p[:,None,:]-src[None,:,:])**2,axis=2)
    return d*np.log(np.maximum(d,1e-16))
aff=np.column_stack([np.ones(len(src)),src])
coef=np.linalg.solve(np.block([[radial(src),aff],[aff.T,np.zeros((3,3))]]),
                     np.vstack([target,np.zeros((3,2))]))
def warp(points):
    p=np.atleast_2d(points)
    return np.column_stack([radial(p),np.ones(len(p)),p])@coef

for obj in (shell,cuff):
    coords=np.zeros(len(obj.data.vertices)*3,dtype=np.float32)
    obj.data.vertices.foreach_get("co",coords)
    coords=coords.reshape((-1,3))
    coords[:,:2]=warp(coords[:,:2])
    if obj == shell:
        # The photographed board wraps the heel of the thumb. Add the thenar
        # volume beneath this flare, fading it into the wrist and thumb shaft.
        px=215+110*coords[:,0]
        py=610-110*(coords[:,1]-.4)
        flare=np.interp(py,[696,710,720,730,740,750,760,770,790,805,820,830,842,856,873],
                           [0,1,6,20,35,50,59,60,61,60,51,40,23,11,0])
        # Support the outer turn of the root meander on the thenar heel.
        flare+=16*np.exp(-((py-759)/34)**2)
        influence=np.clip((px-248)/90,0,1)
        coords[:,0]+=flare*influence*influence*(3-2*influence)/110
    obj.data.vertices.foreach_set("co",coords.ravel())
    obj.data.update()

bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
rest=[(b.name,b.head.copy(),b.tail.copy()) for b in rig.data.edit_bones]
for name,h,t in rest:
    bone=rig.data.edit_bones[name]
    h.xy=warp([h.x,h.y])[0]
    t.xy=warp([t.x,t.y])[0]
    bone.head,bone.tail=h,t
# The viewer flexes about local -X. Roll the two flexion frames toward
# the palm without moving their pivots, changing bone lengths or posing the glove.
for name in ("Thumb_MCP","Thumb_IP"):
    rig.data.edit_bones[name].roll += radians(30)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()
mesh=shell.data
# Rebind the thumb in the registered (photographic) rest space. The old
# nearest-chain weights were calculated before the thin-plate warp.
def smooth_band(value, start, end):
    t=np.clip((value-start)/(end-start),0,1)
    return t*t*(3-2*t)

def bind_thumb_web():
    xyz=np.array([v.co[:] for v in mesh.vertices])
    uv=xyz[:,:2]*[110,-110]+[215,654]
    joints=np.array(landmarks["Thumb"],dtype=float)
    axes=np.diff(joints,axis=0)
    lengths=np.linalg.norm(axes,axis=1)
    axes/=lengths[:,None]
    # Signed distance along each joint's local bisector varies continuously
    # across the thickness of the web and both sides of the MCP.
    tangent=axes[:-1]+axes[1:]
    tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    along=(uv-joints[0])@axes[0]
    mcp=(uv-joints[1])@tangent[0]
    ip=(uv-joints[2])@tangent[1]
    distances=[]
    for start,axis,length in zip(joints,axes,lengths):
        d=uv-start
        distances.append(np.linalg.norm(d-np.clip(d@axis,0,length)[:,None]*axis,axis=1))
    radius=np.min(distances,axis=0)
    thumb=smooth_band(along,-88,40)*(1-smooth_band(radius,57,145))
    bend=smooth_band(mcp,-76,76)
    distal=smooth_band(ip,-55,55)
    names=("Thumb_CMC","Thumb_MCP","Thumb_IP")
    ids=[shell.vertex_groups[n].index for n in names]
    root_id=shell.vertex_groups["WristRoot"].index
    for v in mesh.vertices:
        idx=v.index
        old={g.group:g.weight for g in v.groups}
        if thumb[idx]<1e-7 and not any(g in old for g in ids): continue
        other={k:w for k,w in old.items() if k not in ids}
        # Fade the original non-thumb weights into the palm at the radial edge.
        # A former exclusively thumb-bound vertex requires a palm fallback.
        other[root_id]=other.get(root_id,0)+sum(old.get(k,0) for k in ids)
        weights={k:w*(1-thumb[idx]) for k,w in other.items()}
        weights.update(zip(ids,thumb[idx]*np.array([1-bend[idx],bend[idx]*(1-distal[idx]),bend[idx]*distal[idx]])))
        keep=sorted(weights.items(),key=lambda item:-item[1])[:4]
        total=sum(w for _,w in keep)
        for k in old: shell.vertex_groups[k].remove([idx])
        for k,w in keep:
            if w>1e-7: shell.vertex_groups[k].add([idx],float(w/total),"REPLACE")
bind_thumb_web()
mesh.calc_loop_triangles()
coords=[v.co.copy() for v in mesh.vertices]
triangles=[list(t.vertices) for t in mesh.loop_triangles]
surface=BVHTree.FromPolygons(coords,triangles,all_triangles=True)

def support(p):
    x,y=xy(p)
    loc,_,idx,_=surface.ray_cast(Vector((x,y,2)),Vector((0,0,-1)))
    if loc is None:
        loc,_,idx,_=surface.find_nearest(Vector((x,y,.42)))
    ia,ib,ic=triangles[idx]
    a,b,c=coords[ia],coords[ib],coords[ic]
    edges=np.array([b-a,c-a]).T
    u,v=np.linalg.lstsq(edges,np.array(loc-a),rcond=None)[0]
    weights={}
    for i,fac in zip((ia,ib,ic),(1-u-v,u,v)):
        for g in mesh.vertices[i].groups:
            name=shell.vertex_groups[g.group].name
            weights[name]=weights.get(name,0)+max(fac,0)*g.weight
    # The component region is locally stiff, with a soft transition into branches.
    px,py=p
    board_blend=np.clip((py-570)/57,0,1)*np.clip((437-px)/40,0,1)
    # At the thumb take-off, use the actual hit (also on the curved
    # flank) so the branch and the board share the same mounting surface.
    thumb_side=smooth_band(px,363,415)
    board_blend*=1-thumb_side
    x+=thumb_side*(loc.x-x)
    y+=thumb_side*(loc.y-y)
    h=loc.z*(1-board_blend)+max(loc.z,.47)*board_blend+.023
    weights={k:v*(1-board_blend) for k,v in weights.items()}
    weights["WristRoot"]=weights.get("WristRoot",0)+board_blend
    return (float(x),float(y),float(h)),weights

image=bpy.data.images.load(str(root/"assets/reference/hsad_fpc_front.png"))
image.pack()
def material(name,color,rough,metal=0,photo=False):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=rough
    bsdf.inputs["Metallic"].default_value=metal
    if photo:
        tex=mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image=image
        mat.node_tree.links.new(tex.outputs["Color"],bsdf.inputs["Base Color"])
    return mat
polyimide=material("Cut polyimide edge",(.40,.125,.008),.48)
edge=material("Package edge",(.032,.035,.033),.54)
foil=material("Reference | flexible laminate",(1,1,1),.58,.03,True)
pkg=material("Reference | electronics",(1,1,1),.46,.09,True)
shield=material("Reference | metal lid",(1,1,1),.37,.16,True)
def anchor(name,point,part=None,bone="WristRoot"):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.location=point
    bpy.context.view_layer.update()
    world=obj.matrix_world.copy()
    obj.parent=rig
    obj.parent_type="BONE"
    obj.parent_bone=bone
    obj.matrix_world=world
    if part:obj["hsadPartId"]=part
    return obj
for name,p,part in [("DeviceRoot",(213,713),"acquisition"),
        ("SignalConditioning",(170,649),"conditioning"),("PowerManagement",(290,811),"power"),
        ("FingerFPC",(246,484),"fpc"),("IMUModule",(255,719),"imu"),("BatteryModule",(199,750),"battery")]:
    point=list(support(p)[0])
    if part in ("imu","battery"):point[2]-=.15
    anchor(name,point,part)

# Keep the internal components as solids beneath the photographed board.
for name,dims in [("BatteryModule",(1.22,.80,.12)),("IMUModule",(.35,.30,.07))]:
    parent=bpy.data.objects[name]
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=bpy.context.object
    obj.name=name+"_Internal"
    obj.parent=parent
    obj.location=(0,0,0)
    obj.dimensions=dims
    obj.data.materials.append(edge)

from functools import lru_cache
support= lru_cache(maxsize=None)(support)
for part in parts:
    name,kind=part["name"],part["kind"]
    pixels=[tuple(p) for p in part["points"]]
    records=[support(p) for p in pixels]
    count=len(pixels)
    base=np.array([s[0] for s in records])
    top=base.copy()
    top[:,2]+=part["height"]
    bottom=base.copy()
    bottom[:,2]-=.022
    # Pixel Y points down, so correct each triangle's winding in world XY.
    faces=[]
    for a,b,c in part["faces"]:
        v,w=top[b]-top[a],top[c]-top[a]
        faces.append((a,b,c) if v[0]*w[1]>v[1]*w[0] else (c,b,a))
    top_count=len(faces)
    oriented={tuple(sorted((a,b))):(a,b) for face in faces for a,b in zip(face,face[1:]+face[:1])}
    faces += [tuple(j+count for j in reversed(f)) for f in faces]
    for pair in part["sides"]:
        a,b=oriented[tuple(pair)]
        faces.append((b,a,a+count,b+count))
    center=top.mean(axis=0)
    geo=bpy.data.meshes.new(name)
    geo.from_pydata((np.vstack([top,bottom])-center).tolist(),[],faces)
    geo.update()
    obj=bpy.data.objects.new(name,geo)
    bpy.context.collection.objects.link(obj)
    obj.location=center
    obj.parent=rig
    obj["hsadPartId"]=kind
    if kind=="sensor":
        for k,val in old_meta[name].items(): obj[k]=val
        bone=obj["boneName"]
        for tag in (obj["anatomicalNodeName"],"Highlight_"+obj["hsadJointId"]):
            a=anchor(tag,center,None,bone)
            a["hsadJointId"]=obj["hsadJointId"]
    mat=shield if name=="ESP32_Shield" else pkg if part["height"] else foil
    geo.materials.append(mat)
    geo.materials.append(edge if part["height"] else polyimide)
    uv=geo.uv_layers.new(name="Measured front")
    for poly in geo.polygons:
        poly.material_index=int(poly.index>=top_count)
        poly.use_smooth=poly.index<top_count
        for li in poly.loop_indices:
            px,py=pixels[geo.loops[li].vertex_index%count]
            uv.data[li].uv=((px+.5)/image.size[0],1-(py+.5)/image.size[1])
    groups={}
    for i,(_,weights) in enumerate(records):
        total=sum(weights.values())
        for bone,v in weights.items():
            if v<1e-6:continue
            if bone not in groups:groups[bone]=obj.vertex_groups.new(name=bone)
            groups[bone].add([i,i+count],v/total,"REPLACE")
    obj.modifiers.new("Surface flexion","ARMATURE").object=rig

bpy.context.preferences.filepaths.save_version=0
bpy.data.objects["HSAD_Metadata"]["modelVersion"]="5.1-thumb-web"
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active=shell
bpy.ops.wm.save_as_mainfile(filepath=str(root/"assets/blender/hsad_reference_device.blend"))
bpy.ops.export_scene.gltf(filepath=str(root/"public/models/hsad/hsad_reference_device.glb"),
    export_format="GLB",export_extras=True,export_animations=False,export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6)
