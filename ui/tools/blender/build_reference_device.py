"""Blender -b assets/blender/hsad_glove.blend -P this_file -- path/to/layout.json
Register the glove to the photographed FPC, preserving the photograph's XY scale.
"""
import json
import sys
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


sys.path.insert(0,str(Path(__file__).resolve().parent))
from fit_worn_hand import register_rig, sculpt

pad_bones={p["name"]:old_meta[p["name"]]["boneName"] for p in parts if p["kind"]=="sensor"}
register_rig(rig,pad_bones)
sculpt(shell,{pad_bones[p["name"]]:p for p in parts if p["kind"]=="sensor"})
# Shape the knit binding around the same tapered wrist cross section.
for vertex in cuff.data.vertices:
    x,y,z=vertex.co
    t=np.clip((y+2.72)/.66,0,1)
    width=126+17*t*t
    vertex.co=((232-215+(x-.04)*width/1.10)/110,
               (654-949+60*t)/110,(z/.425)*(46+4*t)/110)
cuff.data.update()
bpy.context.view_layer.update()
mesh=shell.data
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
    # Mount the underside on the same triangle and copy its skin influences.
    # Keep the small film allowance normal to the shell even on the thumb flank.
    normal=(b-a).cross(c-a).normalized()
    if normal.z<0: normal.negate()
    weights=dict(sorted(weights.items(),key=lambda item:-item[1])[:4])
    return tuple(loc+normal*.015),weights

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
        ("FingerFPC",(246,484),"fpc"),("IMUModule",(254,653),"imu"),("BatteryModule",(200,781),"battery")]:
    point=list(support(p)[0])
    if part in ("imu","battery"):point[2]-=.15
    anchor(name,point,part)

# Keep the internal components as solids beneath the photographed board.
for name,dims in [("BatteryModule",(1.23,1.03,.085)),("IMUModule",(.51,.45,.065))]:
    parent=bpy.data.objects[name]
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=bpy.context.object
    obj.name=name+"_Internal"
    obj.parent=parent
    obj.location=(0,0,0)
    obj.dimensions=dims
    interior = material(name+" housing",(.39,.38,.32) if name=="BatteryModule" else (.024,.13,.095),.48)
    obj.data.materials.append(interior)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=obj.modifiers.new("Folded edge","BEVEL")
    bevel.width=.024
    bevel.segments=3

# Schematic internal packages. Figure 2-5b supplies the layer and footprint.
def internal_detail(parent, name, offset, dimensions, mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    detail=bpy.context.object
    detail.name=name
    detail.parent=parent
    detail.location=offset
    detail.dimensions=dimensions
    detail.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=detail.modifiers.new("Finished edge","BEVEL")
    bevel.width=min(dimensions)*.18
    bevel.segments=2

tin=material("Tinned terminals",(.52,.56,.53),.37,.48)
imu=bpy.data.objects["IMUModule"]
internal_detail(imu,"IMU_Package",(0,0,.043),(.34,.33,.032),tin)
for side in (-1,1):
    for pin in range(5):
        internal_detail(imu,f"IMU_Contact_{side}_{pin}",(side*.22,(pin-2)*.076,.037),(.043,.036,.012),tin)
battery=bpy.data.objects["BatteryModule"]
internal_detail(battery,"Cell_laminate",(0,0,.045),(1.14,.94,.035),tin)
for side in (-1,1):
    internal_detail(battery,f"Cell_tab_{side}",(side*.26,-.55,0),(.14,.16,.018),tin)

from functools import lru_cache
support= lru_cache(maxsize=None)(support)
def refine_surface(part):
    # Adjacent parts use identical edge midpoints, including along pad necks.
    points=list(part["points"])
    midpoints={}
    def mid(a,b):
        key=tuple(sorted((a,b)))
        if key not in midpoints:
            midpoints[key]=len(points)
            points.append([(x+y)/2 for x,y in zip(points[a],points[b])])
        return midpoints[key]
    faces=[]
    for a,b,c in part["faces"]:
        u,v,w=mid(a,b),mid(b,c),mid(c,a)
        faces.extend([(a,u,w),(u,b,v),(w,v,c),(u,v,w)])
    sides=[tuple(sorted(edge)) for a,b in part["sides"] for edge in ((a,mid(a,b)),(mid(a,b),b))]
    return {**part,"points":points,"faces":faces,"sides":sides}

for part in parts:
    part=refine_surface(part)
    name,kind=part["name"],part["kind"]
    pixels=[tuple(p) for p in part["points"]]
    records=[support(p) for p in pixels]
    count=len(pixels)
    base=np.array([s[0] for s in records])
    top=base.copy()
    top[:,2]+=part["height"]
    bottom=base.copy()
    bottom[:,2]-=.012
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
        bone="Mount_"+obj["boneName"]
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
        if kind=="sensor": weights={"Mount_"+pad_bones[name]:1.0}
        total=sum(weights.values())
        for bone,v in weights.items():
            if v<1e-6:continue
            if bone not in groups:groups[bone]=obj.vertex_groups.new(name=bone)
            groups[bone].add([i,i+count],v/total,"REPLACE")
    obj.modifiers.new("Surface flexion","ARMATURE").object=rig

# Anchor each overview label on a triangle of the actual photographic surface.
# The selected triangle lies inside the meander even where its bounding box is empty.
for kind,name,pixel in [
    ("sensor","Sensor_M2",(258,270)), ("fpc","MainFPC",(338,718)),
    ("serpentine","Serpentine_M",(250,381)), ("acquisition","CircuitModule",(224,733)),
    ("conditioning","Amplifier_02",(168,644)), ("esp32","ESP32_Shield",(184,788)),
    ("power","PowerPackage_07",(297,776)), ("mux","MuxPackage_03",(262,783)),
    ("serial","SerialPackage_02",(122,774))]:
    part=next(part for part in parts if part["name"]==name)
    pts=np.array(part["points"])[part["faces"]].mean(axis=1)
    uv=pts[np.argmin(np.linalg.norm(pts-pixel,axis=1))]
    point,weights=support(tuple(uv))
    point=list(point)
    point[2]+=part["height"]+.006
    anchor("Guide_"+kind,point,kind,max(weights,key=weights.get))

# Extend a wrist from the inside lip of the cuff, using its actual registered rim.
rim=np.array([list(cuff.data.vertices[i].co) for i in range(0,288,3)])
center=rim.mean(axis=0)
verts=[]; faces=[]; colors=[]
segments=len(rim)
for j in range(33):
    t=j/32
    for i,v in enumerate(rim):
        angle=2*np.pi*i/segments
        radius=.79+.16*t+.038*np.exp(-((t-.37)/.16)**2)*np.cos(2*angle+.4)
        radius-=.013*np.exp(-((t-.21-.04*np.sin(angle))/.026)**2)
        point=center+(v-center)*radius
        # The elastic lip takes the shape of the cuff; the exposed forearm
        # transitions to an oval with a slight ulnar prominence.
        ellipse=np.array([1.0*np.cos(angle),0,.44*np.sin(angle)])
        easing=t*t*(3-2*t)
        point[[0,2]]=(1-.75*easing)*point[[0,2]]+.75*easing*(center+ellipse*radius)[[0,2]]
        point[0]-=.10*t
        point[1]+=.14-1.85*t
        point[2]-=.028*t
        verts.append(point)
        warmth=.023*np.sin(angle-.7)+.014*np.cos(3*angle+2*t)
        colors.append((.55+warmth,.32+warmth*.6,.225+warmth*.4,1))
        if j:
            a=(j-1)*segments+i; b=(j-1)*segments+(i+1)%segments
            faces.append((a,a+segments,b+segments,b))
faces.append(tuple(range(32*segments,33*segments)))
geo=bpy.data.meshes.new("Wearer wrist")
geo.from_pydata(verts,[],faces)
import bmesh
bm=bmesh.new(); bm.from_mesh(geo)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(geo); bm.free()
wrist=bpy.data.objects.new("Wearer_Wrist",geo)
bpy.context.collection.objects.link(wrist)
skin=material("Skin at cuff",(.55,.32,.225),.68)
tint=geo.color_attributes.new(name="Skin tone",type="FLOAT_COLOR",domain="POINT")
tint.data.foreach_set("color",np.array(colors,dtype=np.float32).ravel())
attr=skin.node_tree.nodes.new("ShaderNodeVertexColor")
attr.layer_name=tint.name
skin.node_tree.links.new(attr.outputs["Color"],skin.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
# Map the skin around the circumference with a UV seam on the underside.
uv=geo.uv_layers.new(name="Wrist surface")
for poly in geo.polygons:
    columns=[geo.loops[li].vertex_index%segments for li in poly.loop_indices]
    seam=min(columns)==0 and max(columns)==segments-1
    for li in poly.loop_indices:
        row,col=divmod(geo.loops[li].vertex_index,segments)
        uv.data[li].uv=((segments if seam and col==0 else col)/segments,row/32)

# Pack a fine relief map for pores and shallow transverse wrist folds.
rng=np.random.default_rng(319)
ny,nx=256,768
v,u=np.mgrid[0:ny,0:nx]/np.array([ny,nx])[:,None,None]
height=rng.normal(0,.035,(ny,nx))
for depth,level in [(.14,.21),(.10,.31),(.055,.64)]:
    fold=v-level-.045*np.sin(2*np.pi*u+.3)-.018*np.sin(4*np.pi*u)
    height-=depth*np.exp(-(fold/.012)**2)*(.6+.4*np.sin(2*np.pi*u))
height+=.042*np.sin(2*np.pi*(43*u+17*v+1.3*np.sin(2*np.pi*v)))
dx=np.roll(height,-1,1)-np.roll(height,1,1)
dy=np.roll(height,-1,0)-np.roll(height,1,0)
normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=2)
normal/=np.linalg.norm(normal,axis=2,keepdims=True)
rgba=np.ones((ny,nx,4),np.float32)
rgba[:,:,:3]=.5+.5*normal
relief=bpy.data.images.new("Wrist microrelief",nx,ny,alpha=False)
relief.colorspace_settings.name="Non-Color"
relief.pixels.foreach_set(rgba.ravel())
relief.pack()
texture=skin.node_tree.nodes.new("ShaderNodeTexImage")
texture.image=relief
nm=skin.node_tree.nodes.new("ShaderNodeNormalMap")
skin.node_tree.links.new(texture.outputs["Color"],nm.inputs["Color"])
skin.node_tree.links.new(nm.outputs["Normal"],skin.node_tree.nodes["Principled BSDF"].inputs["Normal"])
geo.materials.append(skin)
for poly in geo.polygons: poly.use_smooth=True
wrist.parent=rig
group=wrist.vertex_groups.new(name="WristRoot")
group.add(list(range(len(verts))),1,"REPLACE")
wrist.modifiers.new("Wrist motion","ARMATURE").object=rig
shell.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(.039,.044,.050,1)

# The black knit sleeve continues past the board before the forearm emerges.
sleeve_points=[]; sleeve_faces=[]
for row in range(19):
    t=row/18
    for col,v in enumerate(rim):
        angle=2*np.pi*col/segments
        scale=.955+.027*np.exp(-((t-.94)/.06)**2)+.008*np.sin(10*angle+5*t)
        point=center+(v-center)*scale
        point[0]-=.04*t
        point[1]+=.065-.94*t
        sleeve_points.append(point)
        if row:
            a=(row-1)*segments+col; b=(row-1)*segments+(col+1)%segments
            sleeve_faces.append((a,b,b+segments,a+segments))
sleeve_mesh=bpy.data.meshes.new("Long knitted cuff")
sleeve_mesh.from_pydata(sleeve_points,[],sleeve_faces)
sleeve_uv=sleeve_mesh.uv_layers.new(name="Textile")
for poly in sleeve_mesh.polygons:
    poly.use_smooth=True
    for loop in poly.loop_indices:
        row,col=divmod(sleeve_mesh.loops[loop].vertex_index,segments)
        seam=col==0 and poly.index%segments==segments-1
        sleeve_uv.data[loop].uv=(24*(1 if seam else col/segments),4*row/18)
sleeve=bpy.data.objects.new("Knitted_wrist_sleeve",sleeve_mesh)
bpy.context.collection.objects.link(sleeve)
sleeve_mesh.materials.append(shell.data.materials[0])
sleeve.parent=rig
group=sleeve.vertex_groups.new(name="WristRoot")
group.add(list(range(len(sleeve_points))),1,"REPLACE")
sleeve.modifiers.new("Wrist motion","ARMATURE").object=rig

bpy.context.preferences.filepaths.save_version=0
bpy.data.objects["HSAD_Metadata"]["modelVersion"]="8.0-rigid-mounts"
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active=shell
bpy.ops.wm.save_as_mainfile(filepath=str(root/"assets/blender/hsad_reference_device.blend"))
bpy.ops.export_scene.gltf(filepath=str(root/"public/models/hsad/hsad_reference_device.glb"),
    export_format="GLB",export_extras=True,export_animations=False,export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6)
