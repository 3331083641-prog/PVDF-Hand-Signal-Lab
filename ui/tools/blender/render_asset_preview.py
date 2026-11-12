import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args_after_separator():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


parser = argparse.ArgumentParser()
parser.add_argument("--fbx")
parser.add_argument("--output", required=True)
args = parser.parse_args(args_after_separator())

if args.fbx:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.fbx, use_anim=False)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("No mesh found")

corners = []
for obj in meshes:
    corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
center = (minimum + maximum) * 0.5
size = max(maximum - minimum)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE" if bpy.app.version >= (5, 0, 0) else "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 900
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(Path(args.output))
scene.render.film_transparent = False
if scene.world is None:
    scene.world = bpy.data.worlds.new("PreviewWorld")
scene.world.color = (0.055, 0.065, 0.075)

for obj in list(scene.objects):
    if obj.type in {"LIGHT", "CAMERA"}:
        bpy.data.objects.remove(obj, do_unlink=True)

camera_data = bpy.data.cameras.new("PreviewCamera")
camera = bpy.data.objects.new("PreviewCamera", camera_data)
scene.collection.objects.link(camera)
camera.location = center + Vector((size * 1.15, -size * 2.05, size * 0.95))
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 56
camera.data.clip_start = max(size * 0.001, 0.000001)
camera.data.clip_end = size * 100
scene.camera = camera

for name, position, energy, area in [
    ("Key", center + Vector((-size, -size, size * 1.8)), 950, size * 1.5),
    ("Fill", center + Vector((size * 1.4, -size * .4, size * .4)), 650, size),
    ("Rim", center + Vector((0, size * 1.5, size)), 820, size),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = area
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()

output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.render.render(write_still=True)
print(f"HSAD_PREVIEW={output}")
