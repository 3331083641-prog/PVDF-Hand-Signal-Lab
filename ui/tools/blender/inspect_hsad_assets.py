import argparse
import json
import sys
from pathlib import Path

import bpy


def argv_after_separator():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


parser = argparse.ArgumentParser()
parser.add_argument("--fbx")
parser.add_argument("--output", required=True)
args = parser.parse_args(argv_after_separator())

if args.fbx:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.fbx, use_anim=True, automatic_bone_orientation=False)

objects = []
triangle_total = 0
for obj in bpy.context.scene.objects:
    item = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "dimensions": [round(float(value), 5) for value in obj.dimensions],
        "location": [round(float(value), 5) for value in obj.location],
    }
    if obj.type == "MESH":
        triangles = sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
        triangle_total += triangles
        item["vertices"] = len(obj.data.vertices)
        item["polygons"] = len(obj.data.polygons)
        item["triangles"] = triangles
        item["materials"] = [slot.material.name if slot.material else None for slot in obj.material_slots]
    if obj.type == "ARMATURE":
        item["bones"] = [
            {
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
                "head": [round(float(value), 6) for value in bone.head_local],
                "tail": [round(float(value), 6) for value in bone.tail_local],
            }
            for bone in obj.data.bones
        ]
    objects.append(item)

report = {
    "blender_version": bpy.app.version_string,
    "source": bpy.data.filepath or args.fbx,
    "object_count": len(objects),
    "mesh_count": sum(1 for item in objects if item["type"] == "MESH"),
    "armature_count": sum(1 for item in objects if item["type"] == "ARMATURE"),
    "triangle_total": triangle_total,
    "frame_start": bpy.context.scene.frame_start,
    "frame_end": bpy.context.scene.frame_end,
    "frame_current": bpy.context.scene.frame_current,
    "actions": [
        {
            "name": action.name,
            "frame_range": [float(action.frame_range[0]), float(action.frame_range[1])],
            "slots": len(action.slots) if hasattr(action, "slots") else None,
        }
        for action in bpy.data.actions
    ],
    "objects": objects,
}

output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"HSAD_INSPECT_REPORT={output}")
print(f"HSAD_OBJECTS={len(objects)} HSAD_TRIANGLES={triangle_total}")
