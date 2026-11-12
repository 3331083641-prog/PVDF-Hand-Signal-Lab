"""Check the underside of all 14 pads and five meanders against the posed glove.

Run with Blender -b assets/blender/hsad_reference_device.blend -P this_file.
Distances are in Blender units. Samples include vertices and triangle centroids.
"""
import bpy
import numpy as np
from math import radians
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree

rig = bpy.data.objects["HandRoot"]
shell = bpy.data.objects["HandMesh"]
fist = {"Index":(80,88,68), "Middle":(83,90,72), "Ring":(85,90,73),
        "Little":(86,89,76), "Thumb":(48,58)}
spread = {"Index":(-7,2,5),"Middle":(-1,0,0),"Ring":(3,-2,-6),"Little":(8,-4,-12)}
axes = [Vector(a) for a in ((1,0,0),(0,1,0),(0,0,1))]


def turn(axis,deg):
    return Quaternion(axes[axis],radians(deg))


def smooth(value):
    u = min(1,max(0,value))
    return u*u*(3-2*u)


def pose(fraction):
    for finger,target in fist.items():
        names = ("MCP","IP") if finger=="Thumb" else ("MCP","PIP","DIP")
        for j,(suffix,closed) in enumerate(zip(names,target)):
            angle = 4+(closed-4)*fraction
            q = turn(0,-angle)
            if j==0 and finger in spread:
                a,b,roll = spread[finger]
                t = smooth((angle-4)/68)
                q = turn(2,a+(b-a)*t) @ turn(1,roll*t) @ q
            rig.pose.bones[f"{finger}_{suffix}"].rotation_quaternion = q
    t = smooth((4+44*fraction-3)/45)
    rig.pose.bones["Thumb_CMC"].rotation_quaternion = turn(2,4-16*t) @ turn(1,12+11*t) @ turn(0,-4-45*t)
    bpy.context.view_layer.update()


def inspect_part(obj,tree,graph):
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.data
    half = len(mesh.vertices)//2
    pts = [evaluated.matrix_world@v.co for v in mesh.vertices[half:]]
    triangles = [f for f in mesh.polygons if min(f.vertices)>=half]
    pts.extend(evaluated.matrix_world@f.center for f in triangles)
    signed = []
    for p in pts:
        near,normal,_,dist = tree.find_nearest(p)
        signed.append(dist if (p-near).dot(normal)>=0 else -dist)
    return signed


def film_strain(obj,graph):
    # Compare in-plane lengths of top-surface edges to their rest lengths.
    half = len(obj.data.vertices)//2
    edges = np.array([e.vertices[:] for e in obj.data.edges if max(e.vertices)<half])
    def lengths(mesh):
        xyz = np.array([v.co[:] for v in mesh.vertices[:half]])
        return np.linalg.norm(xyz[edges[:,0]]-xyz[edges[:,1]],axis=1)
    ref = lengths(obj.data)
    posed = lengths(obj.evaluated_get(graph).data)
    return abs(posed[ref>.014]/ref[ref>.014]-1)


parts = [obj for obj in bpy.context.scene.objects if obj.type=="MESH" and obj.get("hsadPartId") in ("sensor","serpentine")]
assert len(parts)==19
worst = 0
for fraction in (0,.25,.5,.75,1):
    pose(fraction)
    graph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(shell,graph)
    assert shell.matrix_world.is_identity
    for kind in ("sensor","serpentine"):
        vals=np.concatenate([inspect_part(obj,tree,graph) for obj in parts if obj["hsadPartId"]==kind])
        worst=max(worst,float(np.max(np.abs(vals))))
        print(f"POSE {fraction:.2f} {kind:10s} samples={len(vals)} p95_abs={np.percentile(abs(vals),95):.4f} min={min(vals):.4f} max={max(vals):.4f}")
    stretch = np.concatenate([film_strain(o,graph) for o in parts if o["hsadPartId"]=="sensor"])
    assert max(stretch)<.01, "Sensor laminate stretched more than one percent"
    print(f"PAD strain p95={np.percentile(stretch,95):.4f} max={max(stretch):.4f}")
print(f"WORST absolute clearance {worst:.4f} Blender units")
assert worst<.018, "Attachment error exceeds two reference-image pixels"
