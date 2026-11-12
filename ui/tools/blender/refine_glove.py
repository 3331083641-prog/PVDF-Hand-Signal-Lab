"""Blender -b assets/blender/hsad_hand_joint_sensor_corrected.blend -P tools/blender/refine_glove.py

Rebuild the wearable shell around the existing sensor rig in its rest space.
Output paths are relative to the project; the input Blend is left intact.
"""
from pathlib import Path
import math
import bpy
import bmesh
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
rig = bpy.data.objects["HandRoot"]
bones = rig.data.bones
for obj in list(bpy.context.scene.objects):
    if obj.type == "MESH" and (obj.name.startswith("Hand_") or obj.name == "HandMesh"):
        bpy.data.objects.remove(obj, do_unlink=True)

step = .038
origin = np.array([-1.9, -2.85, -.88])
x, y, z = np.ogrid[:154, :205, :51]
x, y, z = [axis * step + offset for axis, offset in zip((x, y, z), origin)]


def union(a, b, width):
    overlap = np.maximum(width - np.abs(a - b), 0) / width
    return np.minimum(a, b) - overlap ** 2 * width * .25


def ellipsoid(cx, cy, cz, rx, ry, rz):
    return (np.sqrt(((x-cx)/rx)**2 + ((y-cy)/ry)**2 + ((z-cz)/rz)**2) - 1) * rz


# Cross sections widen from the heel to the metacarpals. The palmar side
# has two pads separated by a shallow transverse hollow.
levels = [-2.65,-2.38,-1.95,-1.55,-.85,-.25,.38,.72,1.03,1.26,1.36]
width = np.interp(y, levels, [.92,.96,1.01,1.10,1.34,1.49,1.45,1.37,1.23,.86,.45])
depth = np.interp(y, levels, [.35,.36,.37,.41,.46,.47,.44,.35,.27,.19,.10])
crease = .055*np.exp(-((y-.08-.19*x)/.13)**2) * (z < 0)
section = ((np.abs((x-.04)/width)**2.9 + np.abs((z-crease)/depth)**2.9)**(1/2.9)-1)*depth
field = np.maximum(section, np.maximum(-2.60-y, y-1.30))
field = union(field, ellipsoid(.92,-.48,-.17,.73,1.03,.39),.23)
field = union(field, ellipsoid(-.85,-.77,-.16,.46,1.00,.33),.18)

specs = {
    "Index": [.31,.285,.245,.205], "Middle": [.325,.30,.255,.21],
    "Ring": [.31,.282,.24,.20], "Little": [.275,.245,.205,.17],
    "Thumb": [.47,.37,.31,.245],
}
chains = []
for finger, radii in specs.items():
    suffixes = ("CMC","MCP","IP") if finger == "Thumb" else ("MCP","PIP","DIP")
    chain = [bones[f"{finger}_{s}"] for s in suffixes]
    heads = np.array([list(b.head_local) for b in chain])
    end = np.array(chain[-1].tail_local)
    # The thumb metacarpal and phalanges have slightly different axes.
    shafts = []
    along = 0.
    for index, bone in enumerate(chain):
        start = heads[index]
        delta = np.array(bone.tail_local) - start
        length = np.linalg.norm(delta)
        axis = delta / length
        shafts.append((start, axis, length, along))
        axial = (x-start[0])*axis[0]+(y-start[1])*axis[1]+(z-start[2])*axis[2]
        lateral = (x-start[0])*axis[1]-(y-start[1])*axis[0]
        u = np.clip(axial/length,0,1)
        r = radii[index]*(1-u)+radii[index+1]*u
        # Narrow the shaft between knuckles and accent the volar finger pads.
        waist = 1-.087*np.sin(np.pi*u)**2
        pad = .075*np.sin(np.pi*u)**2
        fold = .042*np.exp(-((axial-.11)/.075)**2)
        vertical = z-(start[2]+u*delta[2])
        rz = np.where(vertical<0, r*.98 + pad-fold, r*.85)
        # Rounded terminal cap extends beyond the flexible ribbon.
        cap = np.maximum(-axial,axial-length).clip(0)/(r*.99)
        sdf = (np.sqrt((lateral/(r*waist))**2+(vertical/rz)**2+cap**2)-1)*r
        blend_width = .008 + .115*np.exp(-(axial/.46)**2) if index == 0 else .014
        field = union(field,sdf,blend_width)
        along += length
    chains.append((chain, shafts))

# Surface nets: one vertex for each cell crossed by the implicit surface.
corners = np.array([[i,j,k] for i in range(2) for j in range(2) for k in range(2)])
values = np.stack([field[i:i+153,j:j+204,k:k+50] for i,j,k in corners],axis=-1)
cells = np.argwhere((values.min(-1)<0) & (values.max(-1)>=0))
samples = values[tuple(cells.T)]
positions = np.zeros((len(cells),3))
counts = np.zeros(len(cells))
for i,c in enumerate(corners):
    for axis in range(3):
        if c[axis]: continue
        j = i + (4,2,1)[axis]
        mask = (samples[:,i]<0) != (samples[:,j]<0)
        t = samples[mask,i]/(samples[mask,i]-samples[mask,j])
        positions[mask] += c + t[:,None]*(corners[j]-c)
        counts[mask] += 1
points = origin + (cells + positions/counts[:,None])*step
ids = np.full(values.shape[:3],-1,dtype=int)
ids[tuple(cells.T)] = np.arange(len(cells))
faces = []
for axis in range(3):
    a,b = (axis+1)%3,(axis+2)%3
    crossings = np.argwhere(np.diff(field<0,axis=axis))
    ea,eb = np.eye(3,dtype=int)[[a,b]]
    quad = np.stack([ids[tuple(v.T)] for v in (crossings,crossings-ea,crossings-ea-eb,crossings-eb)],axis=1)
    assert np.all(quad>=0), "Surface intersects the meshing boundary"
    faces.extend(quad.tolist())


def mesh_object(name, verts, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def material(name, rgb, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb,1)
    shader.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = (*rgb,1)
    return mat


cloth = material("Graphite technical knit",(.052,.074,.085),.84)
shell = mesh_object("HandMesh",points.tolist(),faces,cloth)
# Weight each finger in longitudinal rest coordinates. Nearest finite segment
# assigns its chain; the web transitions to WristRoot across the MCP axis.
groups = {b.name:shell.vertex_groups.new(name=b.name) for b in bones}
distances, coordinates = [], []
for chain, shafts in chains:
    ds, ts = [], []
    for start,axis,length,along in shafts:
        axial = (points-start)@axis
        closest = start + np.clip(axial,0,length)[:,None]*axis
        ds.append(np.linalg.norm(points-closest,axis=1))
        ts.append(along+axial)
    seg = np.argmin(ds,axis=0)
    distances.append(np.min(ds,axis=0))
    coordinates.append(np.choose(seg,ts))
nearest = np.argmin(distances,axis=0)
for index,(chain,shafts) in enumerate(chains):
    selected = np.flatnonzero(nearest==index)
    t = coordinates[index][selected]
    prev = np.ones(len(t))
    names = ["WristRoot"]+[b.name for b in chain]
    for joint,name in enumerate(names):
        if joint == len(chain):
            after = np.zeros(len(t))
        else:
            span = .31 if joint==0 else .22
            f = np.clip((t-shafts[joint][3]+span)/(2*span),0,1)
            after = f*f*(3-2*f)
        w = prev-after
        full = selected[w>=.99999].tolist()
        if full: groups[name].add(full,1,"REPLACE")
        for k in np.flatnonzero((w>.00001)&(w<.99999)):
            groups[name].add([int(selected[k])],float(w[k]),"REPLACE")
        prev = after
shell.parent = rig
shell.modifiers.new("Glove flexion","ARMATURE").object = rig

# Woven relief is embedded as a repeating tangent normal texture for glTF.
uv = shell.data.uv_layers.new(name="Textile")
for face in shell.data.polygons:
    omit = np.argmax(np.abs(face.normal))
    axes = [(1,2),(0,2),(0,1)][omit]
    for loop in face.loop_indices:
        p = points[shell.data.loops[loop].vertex_index]
        uv.data[loop].uv = (p[axes[0]]*4,p[axes[1]]*4)
tile = 128
u,v = np.meshgrid(np.arange(tile)/tile,np.arange(tile)/tile)
warp = np.cos(2*np.pi*(8*u+.17*np.sin(2*np.pi*4*v)))
weft = np.cos(2*np.pi*8*v)
over = .5+.5*np.cos(2*np.pi*4*(u+v))
height = warp*over+weft*(1-over)
dx = (np.roll(height,-1,1)-np.roll(height,1,1))*.56
dy = (np.roll(height,-1,0)-np.roll(height,1,0))*.56
normal = np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
pixels = np.ones((tile,tile,4),dtype=np.float32)
pixels[:,:,:3] = .5+.5*normal
img = bpy.data.images.new("Micro knit normal",tile,tile,alpha=False)
img.colorspace_settings.name = "Non-Color"
img.pixels.foreach_set(pixels.ravel())
img.pack()
tex = cloth.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
nm = cloth.node_tree.nodes.new("ShaderNodeNormalMap")
nm.inputs["Strength"].default_value = .48
cloth.node_tree.links.new(tex.outputs["Color"],nm.inputs["Color"])
cloth.node_tree.links.new(nm.outputs["Normal"],cloth.node_tree.nodes["Principled BSDF"].inputs["Normal"])

# Bound cuff with a slightly flared opening, knitted ribbing and rolled hems.
cuff_mat = material("Charcoal elastic binding",(.026,.039,.048),.73)
verts,quads = [],[]
rows,cols = 36,288
for row in range(rows+1):
    t = row/rows
    yy = -2.72+.66*t
    for col in range(cols):
        angle = 2*math.pi*col/cols
        hem = .034*(math.exp(-((t-.07)/.055)**2)+math.exp(-((t-.94)/.055)**2))
        rib = .012*(1+math.cos(72*angle))*math.sin(math.pi*t)+hem
        c,s = math.cos(angle),math.sin(angle)
        verts.append(((1.07+.03*(1-t)+rib)*math.copysign(abs(c)**.72,c)+.04,yy,(.425+rib)*math.copysign(abs(s)**.72,s)))
        if row:
            a = (row-1)*cols+col
            b = (row-1)*cols+(col+1)%cols
            quads.append((a,b,b+cols,a+cols))
# Turn the opening back into the sleeve so the end has a visible finished lip.
for col in range(cols):
    xx,yy,zz = verts[col]
    verts.append((xx*.89,yy+.09,zz*.84))
base = (rows+1)*cols
for col in range(cols):
    nxt=(col+1)%cols
    quads.append((col,nxt,base+nxt,base+col))
cuff = mesh_object("Wrist_binding",verts,quads,cuff_mat)
cuff.parent = rig
group = cuff.vertex_groups.new(name="WristRoot")
group.add(list(range(len(verts))),1,"REPLACE")
cuff.modifiers.new("Wrist anchor","ARMATURE").object = rig

# Lead shoulders share a mesh per package and inherit its semantic parent.
for chip in list(bpy.context.scene.objects):
    if not chip.name.startswith(("ChargeAmplifier_", "TMUX1574_")):
        continue
    vertices, polygons = [], []
    for side in (-1,1):
        for pin in range(4):
            px = side*(chip.dimensions.x*.5+.009)
            py = (pin-1.5)*.048
            base = len(vertices)
            for dz in (-.009,.009):
                for dx,dy in ((-.034,-.011),(.034,-.011),(.034,.011),(-.034,.011)):
                    vertices.append((px+dx,py+dy,dz-.027))
            polygons.extend(tuple(base+i for i in face) for face in
                ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)))
    leads = mesh_object(chip.name+"_Terminals",vertices,polygons,bpy.data.materials["HSAD_Module_Shield"])
    leads.parent = chip

bpy.context.preferences.filepaths.save_version = 0
bpy.data.objects["HSAD_Metadata"]["modelVersion"] = "4.0-knit"
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    obj.select_set(obj.type in {"MESH","ARMATURE","EMPTY"})
bpy.context.view_layer.objects.active = shell
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"assets/blender/hsad_glove.blend"))
bpy.ops.export_scene.gltf(filepath=str(ROOT/"public/models/hsad/hsad_glove.glb"),
    export_format="GLB",use_selection=True,export_animations=False,export_extras=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6)
