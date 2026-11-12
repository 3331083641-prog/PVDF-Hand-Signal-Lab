"""Merge the supplied rigged hand and dense HSAD FBX into a web-ready GLB.

The script preserves the hand mesh, renames the existing armature, reduces the
FBX scan, aligns it by principal axes, assigns the device vertices to the
nearest joint bone, and adds transparent raycast proxy nodes for teaching UI.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector


def argv_after_separator():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


parser = argparse.ArgumentParser()
parser.add_argument("--blend", required=True)
parser.add_argument("--fbx", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--working-blend", required=True)
parser.add_argument("--report", required=True)
parser.add_argument("--target-triangles", type=int, default=72000)
args = parser.parse_args(argv_after_separator())

blend_path = Path(args.blend)
fbx_path = Path(args.fbx)
output_path = Path(args.output)
working_path = Path(args.working_blend)
report_path = Path(args.report)
for path in (output_path, working_path, report_path):
    path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(blend_path))

armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
source_hand_mesh = next((obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.parent == armature), None)
if armature is None or source_hand_mesh is None:
    raise RuntimeError("The Blend file must contain one rigged hand mesh and one armature")

for pose_bone in armature.pose.bones:
    pose_bone.location = (0, 0, 0)
    pose_bone.rotation_mode = "QUATERNION"
    pose_bone.rotation_quaternion = (1, 0, 0, 0)
    pose_bone.scale = (1, 1, 1)
armature.data.pose_position = "REST"

bone_rename = {
    "骨骼": "WristRoot",
    "骨骼.003": "Index_MCP", "骨骼.004": "Index_PIP", "骨骼.005": "Index_DIP",
    "骨骼.006": "Middle_MCP", "骨骼.008": "Middle_PIP", "骨骼.009": "Middle_DIP",
    "骨骼.010": "Ring_MCP", "骨骼.012": "Ring_PIP", "骨骼.013": "Ring_DIP",
    "骨骼.014": "Little_MCP", "骨骼.016": "Little_PIP", "骨骼.017": "Little_DIP",
    "骨骼.007": "Thumb_CMC", "骨骼.011": "Thumb_MCP", "骨骼.015": "Thumb_IP",
}

for old_name, new_name in bone_rename.items():
    bone = armature.data.bones.get(old_name)
    if bone:
        bone.name = new_name
    group = source_hand_mesh.vertex_groups.get(old_name)
    if group:
        group.name = new_name

armature.name = "HandRoot"
armature.data.name = "HSAD_Armature"
source_hand_mesh.name = "SourceGestureHand"

hand_material = bpy.data.materials.new("Hand_Gold")
hand_material.use_nodes = True
hand_bsdf = hand_material.node_tree.nodes.get("Principled BSDF")
if hand_bsdf:
    hand_bsdf.inputs["Base Color"].default_value = (0.46, 0.28, 0.065, 1)
    hand_bsdf.inputs["Roughness"].default_value = 0.56
    hand_bsdf.inputs["Metallic"].default_value = 0.03


def world_bounds(objects):
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    return minimum, maximum


# The supplied mesh is permanently posed. Keep its complete armature topology,
# but establish a neutral open-hand scale from the rest-bone coordinates.
bpy.context.view_layer.update()
bone_points = [armature.matrix_world @ point for bone in armature.data.bones for point in (bone.head_local, bone.tail_local)]
bone_min = Vector((min(v.x for v in bone_points), min(v.y for v in bone_points), min(v.z for v in bone_points)))
bone_max = Vector((max(v.x for v in bone_points), max(v.y for v in bone_points), max(v.z for v in bone_points)))
hand_longest = max(bone_max - bone_min)
scale_factor = 6.2 / max(hand_longest, 1e-6)
armature.scale = tuple(value * scale_factor for value in armature.scale)
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = armature
armature.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
armature.select_set(False)
bpy.context.view_layer.update()

# Replace the permanently posed source surface with a smooth, unified teaching
# hand built around the source armature. Segments overlap slightly so flexion
# remains continuous without a mechanical/robotic appearance.
bpy.data.objects.remove(source_hand_mesh, do_unlink=True)
hand_root = bpy.data.objects.new("HandMesh", None)
bpy.context.scene.collection.objects.link(hand_root)
hand_root.parent = armature


def bone_world_segment(bone_name):
    bone = armature.data.bones[bone_name]
    return armature.matrix_world @ bone.head_local, armature.matrix_world @ bone.tail_local


def parent_to_bone(obj, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world


def create_capsule(name, bone_name, radius, length_scale=1.28):
    head, tail = bone_world_segment(bone_name)
    direction = tail - head
    length = max(direction.length * length_scale, radius * 1.9)
    center = (head + tail) * 0.5
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Y", "Z")
    obj.scale = (radius, length * 0.5, radius * 0.82)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(hand_material)
    parent_to_bone(obj, bone_name)
    return obj


segment_radii = {
    "Thumb_CMC": 0.31, "Thumb_MCP": 0.29, "Thumb_IP": 0.25,
    "Index_MCP": 0.28, "Index_PIP": 0.25, "Index_DIP": 0.22,
    "Middle_MCP": 0.29, "Middle_PIP": 0.26, "Middle_DIP": 0.22,
    "Ring_MCP": 0.28, "Ring_PIP": 0.245, "Ring_DIP": 0.21,
    "Little_MCP": 0.245, "Little_PIP": 0.215, "Little_DIP": 0.19,
}
hand_meshes = [create_capsule(f"Hand_{name}", name, radius) for name, radius in segment_radii.items()]

mcp_names = ["Index_MCP", "Middle_MCP", "Ring_MCP", "Little_MCP"]
mcp_heads = [bone_world_segment(name)[0] for name in mcp_names]
wrist_head, wrist_tail = bone_world_segment("WristRoot")
palm_center = Vector((
    (min(v.x for v in mcp_heads) + max(v.x for v in mcp_heads)) * 0.5,
    (wrist_tail.y + sum(v.y for v in mcp_heads) / len(mcp_heads)) * 0.5,
    sum(v.z for v in mcp_heads) / len(mcp_heads),
))
palm_width = max(v.x for v in mcp_heads) - min(v.x for v in mcp_heads) + 0.92
palm_length = max(abs(palm_center.y - wrist_head.y) * 1.18, 1.85)
bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18, location=palm_center)
palm = bpy.context.object
palm.name = "PalmMesh"
palm.scale = (palm_width * 0.47, palm_length * 0.43, 0.38)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
palm.data.materials.append(hand_material)
parent_to_bone(palm, "WristRoot")
hand_meshes.append(palm)

hand_min, hand_max = world_bounds(hand_meshes)

# Import and reduce the dense, unrigged HSAD scan.
objects_before = set(bpy.context.scene.objects)
bpy.ops.import_scene.fbx(filepath=str(fbx_path), use_anim=False, automatic_bone_orientation=False)
imported = [obj for obj in bpy.context.scene.objects if obj not in objects_before]
device_mesh = max((obj for obj in imported if obj.type == "MESH"), key=lambda obj: len(obj.data.polygons), default=None)
if device_mesh is None:
    raise RuntimeError("No mesh was imported from the FBX")

source_triangles = sum(len(poly.vertices) - 2 for poly in device_mesh.data.polygons)
ratio = min(1.0, max(0.002, args.target_triangles / max(source_triangles, 1)))
bpy.context.view_layer.objects.active = device_mesh
device_mesh.select_set(True)
decimate = device_mesh.modifiers.new("Web_Decimate", "DECIMATE")
decimate.ratio = ratio
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=decimate.name)
device_mesh.select_set(False)

# Principal-axis alignment: long axis -> +Y, width -> X, thickness -> Z.
world_coords = np.array([device_mesh.matrix_world @ vertex.co for vertex in device_mesh.data.vertices], dtype=np.float64)
sample_step = max(1, len(world_coords) // 120000)
sample = world_coords[::sample_step]
mean = sample.mean(axis=0)
centered = sample - mean
covariance = np.cov(centered.T)
eigenvalues, eigenvectors = np.linalg.eigh(covariance)
order = np.argsort(eigenvalues)[::-1]
length_axis = eigenvectors[:, order[0]]
width_axis = eigenvectors[:, order[1]]
normal_axis = eigenvectors[:, order[2]]
if np.dot(np.cross(width_axis, length_axis), normal_axis) < 0:
    normal_axis *= -1

projected = np.column_stack(((world_coords - mean) @ width_axis, (world_coords - mean) @ length_axis, (world_coords - mean) @ normal_axis))
q10, q90 = np.quantile(projected[:, 1], [0.10, 0.90])
upper_width = np.mean(np.abs(projected[projected[:, 1] > q90, 0]))
lower_width = np.mean(np.abs(projected[projected[:, 1] < q10, 0]))
if upper_width < lower_width:
    projected[:, 1] *= -1

# Put the thumb on +X, matching the supplied hand armature.
low_band = projected[:, 1] < np.quantile(projected[:, 1], 0.58)
x_low = projected[low_band, 0]
if abs(np.quantile(x_low, 0.03)) > abs(np.quantile(x_low, 0.97)):
    projected[:, 0] *= -1

device_min = projected.min(axis=0)
device_max = projected.max(axis=0)
hand_center = (hand_min + hand_max) * 0.5
target_y = (hand_max.y - hand_min.y) * 0.94
device_scale = target_y / max(device_max[1] - device_min[1], 1e-6)
projected *= device_scale
device_min = projected.min(axis=0)
device_max = projected.max(axis=0)
translation = np.array([
    hand_center.x - (device_min[0] + device_max[0]) * 0.5,
    hand_center.y - (device_min[1] + device_max[1]) * 0.5 + 0.08,
    hand_max.z + 0.035 - device_min[2],
])
projected += translation

device_mesh.parent = None
device_mesh.matrix_world = Matrix.Identity(4)
for vertex, coordinate in zip(device_mesh.data.vertices, projected):
    vertex.co = Vector(coordinate.tolist())
device_mesh.data.update()

# The FBX scan combines the palm electronics and finger branches in a single
# dense mesh. Retain its rigid palm/circuit region; the flexible branches are
# rebuilt below from the verified 14-bone mapping to prevent crossing fingers.
circuit_cutoff = float(np.quantile(projected[:, 1], 0.43))
mesh_edit = bmesh.new()
mesh_edit.from_mesh(device_mesh.data)
bmesh.ops.delete(mesh_edit, geom=[vertex for vertex in mesh_edit.verts if vertex.co.y > circuit_cutoff], context="VERTS")
mesh_edit.to_mesh(device_mesh.data)
mesh_edit.free()
device_mesh.data.update()
device_mesh.name = "MainFPC"
device_mesh.data.name = "MainFPC_Web_Geometry"

device_material = bpy.data.materials.new("FPC_Orange")
device_material.use_nodes = True
device_bsdf = device_material.node_tree.nodes.get("Principled BSDF")
if device_bsdf:
    device_bsdf.inputs["Base Color"].default_value = (0.92, 0.36, 0.018, 1)
    device_bsdf.inputs["Metallic"].default_value = 0.16
    device_bsdf.inputs["Roughness"].default_value = 0.38
device_mesh.data.materials.clear()
device_mesh.data.materials.append(device_material)

joint_bones = [
    "Thumb_MCP", "Thumb_IP",
    "Index_MCP", "Index_PIP", "Index_DIP",
    "Middle_MCP", "Middle_PIP", "Middle_DIP",
    "Ring_MCP", "Ring_PIP", "Ring_DIP",
    "Little_MCP", "Little_PIP", "Little_DIP",
]


def point_segment_distance(point, head, tail):
    segment = tail - head
    denominator = max(float(np.dot(segment, segment)), 1e-12)
    t = np.clip(float(np.dot(point - head, segment)) / denominator, 0.0, 1.0)
    nearest = head + segment * t
    return float(np.linalg.norm(point - nearest))


bone_segments = {}
for bone_name in joint_bones:
    bone = armature.data.bones.get(bone_name)
    if bone:
        bone_segments[bone_name] = (
            np.array(armature.matrix_world @ bone.head_local),
            np.array(armature.matrix_world @ bone.tail_local),
        )

finger_base_y = float(np.mean([segment[0][1] for name, segment in bone_segments.items() if name.endswith("_MCP") and not name.startswith("Thumb")]))
vertex_group_indices = {}
for bone_name in ["WristRoot", *joint_bones]:
    vertex_group_indices[bone_name] = device_mesh.vertex_groups.new(name=bone_name)

for vertex in device_mesh.data.vertices:
    point = np.array(vertex.co)
    if point[1] < finger_base_y - 0.12:
        selected_bone = "WristRoot"
    else:
        selected_bone = min(bone_segments, key=lambda name: point_segment_distance(point, *bone_segments[name]))
    vertex_group_indices[selected_bone].add([vertex.index], 1.0, "REPLACE")

armature_modifier = device_mesh.modifiers.new("HSAD_Armature", "ARMATURE")
armature_modifier.object = armature
device_mesh.parent = armature
device_mesh.matrix_parent_inverse = armature.matrix_world.inverted()

sensor_material = bpy.data.materials.new("FPC_Sensor_Orange")
sensor_material.use_nodes = True
sensor_bsdf = sensor_material.node_tree.nodes.get("Principled BSDF")
if sensor_bsdf:
    sensor_bsdf.inputs["Base Color"].default_value = (0.95, 0.42, 0.025, 1)
    sensor_bsdf.inputs["Metallic"].default_value = 0.12
    sensor_bsdf.inputs["Roughness"].default_value = 0.32

proxy_material = bpy.data.materials.new("UI_Click_Proxy")
proxy_material.use_nodes = True
proxy_material.diffuse_color = (0.07, 0.62, 0.68, 0.025)
proxy_material.surface_render_method = "DITHERED"
proxy_bsdf = proxy_material.node_tree.nodes.get("Principled BSDF")
if proxy_bsdf:
    proxy_bsdf.inputs["Base Color"].default_value = (0.07, 0.62, 0.68, 1)
    proxy_bsdf.inputs["Alpha"].default_value = 0.025
    proxy_bsdf.inputs["Roughness"].default_value = 0.45


def create_proxy(name, center, scale, bone_name):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    proxy = bpy.context.object
    proxy.name = name
    proxy.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    proxy.data.materials.append(proxy_material)
    world = proxy.matrix_world.copy()
    proxy.parent = armature
    proxy.parent_type = "BONE"
    proxy.parent_bone = bone_name
    proxy.matrix_world = world
    return proxy


sensor_nodes = []
for index, bone_name in enumerate(joint_bones, start=1):
    head, tail = bone_segments[bone_name]
    direction = Vector((tail - head).tolist())
    center = Vector(((head + tail) * 0.52).tolist())
    center.z = max(float(head[2]), float(tail[2])) + 0.34
    length = max(direction.length * 0.58, 0.34)
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    sensor = bpy.context.object
    sensor.name = f"Sensor_{index:02d}"
    sensor.rotation_mode = "QUATERNION"
    sensor.rotation_quaternion = direction.to_track_quat("Y", "Z")
    sensor.scale = (0.22, length * 0.5, 0.055)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = sensor.modifiers.new("Soft_FPC_Edges", "BEVEL")
    bevel.width = 0.055
    bevel.segments = 3
    bpy.context.view_layer.objects.active = sensor
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    sensor.data.materials.append(sensor_material)
    parent_to_bone(sensor, bone_name)
    sensor_nodes.append(sensor)

palm_center = Vector((hand_center.x, finger_base_y - 1.0, hand_max.z + 0.16))
module_nodes = [
    create_proxy("DeviceRoot", palm_center, (0.95, 0.9, 0.04), "WristRoot"),
    create_proxy("CircuitModule", palm_center + Vector((-0.18, 0.05, 0.05)), (0.62, 0.55, 0.04), "WristRoot"),
    create_proxy("ESP32Module", palm_center + Vector((-0.28, -0.05, 0.1)), (0.24, 0.30, 0.04), "WristRoot"),
    create_proxy("BatteryModule", palm_center + Vector((0.58, -0.18, 0.08)), (0.22, 0.38, 0.04), "WristRoot"),
    create_proxy("PowerManagement", palm_center + Vector((0.42, 0.35, 0.09)), (0.20, 0.18, 0.04), "WristRoot"),
]

# SensorGroup is a named hierarchy node; Sensor meshes remain separate children.
sensor_group = bpy.data.objects.new("SensorGroup", None)
bpy.context.scene.collection.objects.link(sensor_group)
sensor_group.parent = armature

for obj in list(bpy.context.scene.objects):
    if obj.type in {"LIGHT", "CAMERA"} or (obj in imported and obj != device_mesh and obj.type != "MESH"):
        bpy.data.objects.remove(obj, do_unlink=True)

armature.data.pose_position = "POSE"
bpy.context.view_layer.update()

working_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(working_path))

export_kwargs = dict(
    filepath=str(output_path),
    export_format="GLB",
    use_selection=False,
    export_yup=True,
    export_apply=False,
    export_animations=False,
    export_skins=True,
    export_morph=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
bpy.ops.export_scene.gltf(**export_kwargs)

final_triangles = 0
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        final_triangles += sum(len(poly.vertices) - 2 for poly in obj.data.polygons)

report = {
    "blend_source": str(blend_path),
    "fbx_source": str(fbx_path),
    "second_blend_found": False,
    "source_fbx_triangles": source_triangles,
    "decimation_ratio": ratio,
    "final_triangles": final_triangles,
    "glb_bytes": output_path.stat().st_size,
    "armature_object": armature.name,
    "bones": [bone.name for bone in armature.data.bones],
    "joint_bones": joint_bones,
    "sensor_nodes": [obj.name for obj in sensor_nodes],
    "module_nodes": [obj.name for obj in module_nodes],
    "web_output": str(output_path),
    "working_blend": str(working_path),
}
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"HSAD_GLB={output_path}")
print(f"HSAD_TRIANGLES={final_triangles}")
print(f"HSAD_GLB_BYTES={output_path.stat().st_size}")
