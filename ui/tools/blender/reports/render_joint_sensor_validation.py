"""Render the requested HSAD joint-sensor validation views.

The script is intentionally non-destructive: it opens the corrected Blend,
poses bones in memory, renders evidence images, and never saves the source.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def argv_after_separator() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


parser = argparse.ArgumentParser()
parser.add_argument("--output-dir", required=True)
args = parser.parse_args(argv_after_separator())
output_dir = Path(args.output_dir)
output_dir.mkdir(parents=True, exist_ok=True)

armature = bpy.data.objects.get("HandRoot")
if armature is None:
    raise RuntimeError("HandRoot armature missing")

joint_ids = ["T2", "T1", "I3", "I2", "I1", "M3", "M2", "M1", "R3", "R2", "R1", "L3", "L2", "L1"]
bone_by_id = {
    "T2": "Thumb_IP", "T1": "Thumb_MCP",
    "I3": "Index_DIP", "I2": "Index_PIP", "I1": "Index_MCP",
    "M3": "Middle_DIP", "M2": "Middle_PIP", "M1": "Middle_MCP",
    "R3": "Ring_DIP", "R2": "Ring_PIP", "R1": "Ring_MCP",
    "L3": "Little_DIP", "L2": "Little_PIP", "L1": "Little_MCP",
}


def reset_pose() -> None:
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = (1, 0, 0, 0)
        pose_bone.location = (0, 0, 0)


def bend(bones: list[str], degrees: float) -> None:
    radians = math.radians(-degrees)
    for name in bones:
        pose_bone = armature.pose.bones.get(name)
        if pose_bone:
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler = (radians, 0, 0)
    bpy.context.view_layer.update()


scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
if scene.world is None:
    scene.world = bpy.data.worlds.new("ValidationWorld")
scene.world.color = (0.055, 0.075, 0.085)

for obj in list(scene.objects):
    if obj.type in {"LIGHT", "CAMERA"}:
        bpy.data.objects.remove(obj, do_unlink=True)

camera_data = bpy.data.cameras.new("ValidationCamera")
camera = bpy.data.objects.new("ValidationCamera", camera_data)
scene.collection.objects.link(camera)
camera.data.type = "ORTHO"
scene.camera = camera

for name, location, energy, size in (
    ("Key", (-4, -4, 10), 1150, 5.5),
    ("Fill", (6, 0, 7), 780, 5.0),
    ("Rim", (0, 8, 6), 900, 4.0),
):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 1.5, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()


def set_camera(location: Vector, target: Vector, ortho_scale: float) -> None:
    camera.location = location
    camera.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = ortho_scale


def render(name: str) -> None:
    scene.render.filepath = str(output_dir / name)
    bpy.ops.render.render(write_still=True)


# Back view with semantic labels at the actual joint axes.
reset_pose()
label_material = bpy.data.materials.new("ValidationLabel")
label_material.diffuse_color = (0.02, 0.15, 0.25, 1)
labels: list[bpy.types.Object] = []
for joint_id in joint_ids:
    anchor = bpy.data.objects.get(f"Highlight_{joint_id}")
    if not anchor:
        continue
    world = anchor.matrix_world.translation
    bpy.ops.object.text_add(location=(world.x, world.y, world.z + 0.55))
    text = bpy.context.object
    text.name = f"ValidationLabel_{joint_id}"
    text.data.body = joint_id
    text.data.align_x = "CENTER"
    text.data.align_y = "CENTER"
    text.data.size = 0.22
    text.data.extrude = 0.008
    text.data.materials.append(label_material)
    labels.append(text)
set_camera(Vector((0, 1.25, 13.5)), Vector((0, 1.25, 0)), 9.3)
render("01_hand_back_14_sensors_labeled.png")
for label in labels:
    label.hide_render = True

# Isolated motion evidence: only the requested finger bends.
for degrees in (0, 30, 60, 90):
    reset_pose()
    bend(["Index_MCP", "Index_PIP", "Index_DIP"], degrees)
    set_camera(Vector((7.3, 2.7, 2.4)), Vector((0.75, 2.7, 0.0)), 7.2)
    render(f"02_index_side_{degrees:02d}.png")

for degrees in (0, 30, 60, 90):
    reset_pose()
    bend(["Thumb_MCP", "Thumb_IP"], degrees)
    thumb_center = Vector((2.30, 0.25, 0.0))
    set_camera(thumb_center + Vector((-4.8, 6.3, 2.1)), thumb_center, 6.4)
    render(f"03_thumb_side_{degrees:02d}.png")

# Fist/contact view, using a graded curl to avoid an artificial hinge stack.
reset_pose()
for finger in ("Index", "Middle", "Ring", "Little"):
    bend([f"{finger}_MCP"], 62)
    bend([f"{finger}_PIP"], 82)
    bend([f"{finger}_DIP"], 68)
bend(["Thumb_MCP"], 48)
bend(["Thumb_IP"], 58)
set_camera(Vector((7.0, -6.4, 6.0)), Vector((0, 0.7, 0)), 8.6)
render("04_fist_sensor_and_fpc.png")

print(f"HSAD_VALIDATION_RENDER_DIR={output_dir}")
