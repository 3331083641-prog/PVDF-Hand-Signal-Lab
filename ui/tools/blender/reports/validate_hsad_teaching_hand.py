"""Independent structural and pose validation for the HSAD teaching hand.

Run with Blender in background mode after opening the source Blend::

  blender --background assets/blender/hsad_teaching_hand.blend \
    --python tools/blender/reports/validate_hsad_teaching_hand.py -- \
    --output-dir tools/blender/reports/teaching_hand_validation \
    --report tools/blender/reports/hsad_teaching_hand_validation.json

The script does not save the Blend. It inspects semantic nodes and deformation
weights, renders neutral/45/90 degree poses, and writes a machine-readable
report for independent review.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def argv_after_separator() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


parser = argparse.ArgumentParser()
parser.add_argument("--output-dir", required=True)
parser.add_argument("--report", required=True)
args = parser.parse_args(argv_after_separator())

output_dir = Path(args.output_dir)
report_path = Path(args.report)
output_dir.mkdir(parents=True, exist_ok=True)
report_path.parent.mkdir(parents=True, exist_ok=True)

EXPECTED_BONES = [
    "WristRoot",
    "Index_MCP", "Index_PIP", "Index_DIP",
    "Middle_MCP", "Middle_PIP", "Middle_DIP",
    "Ring_MCP", "Ring_PIP", "Ring_DIP",
    "Little_MCP", "Little_PIP", "Little_DIP",
    "Thumb_CMC", "Thumb_MCP", "Thumb_IP",
]

JOINTS = [
    ("T2", "Thumb_IP", "Thumb_MCP", "Thumb", "Thumb_IP_Sensor", 1, "1,2", "D1"),
    ("T1", "Thumb_MCP", "Thumb_CMC", "Thumb", "Thumb_MCP_Sensor", 2, "3,4", "D2"),
    ("I3", "Index_DIP", "Index_PIP", "Index", "Index_DIP_Sensor", 3, "5,6", "D3"),
    ("I2", "Index_PIP", "Index_MCP", "Index", "Index_PIP_Sensor", 4, "7,8", "D4"),
    ("I1", "Index_MCP", "WristRoot", "Index", "Index_MCP_Sensor", 5, "9,10", "D5"),
    ("M3", "Middle_DIP", "Middle_PIP", "Middle", "Middle_DIP_Sensor", 6, "11,12", "D6"),
    ("M2", "Middle_PIP", "Middle_MCP", "Middle", "Middle_PIP_Sensor", 7, "13,14", "D7"),
    ("M1", "Middle_MCP", "WristRoot", "Middle", "Middle_MCP_Sensor", 8, "15,16", "D8"),
    ("R3", "Ring_DIP", "Ring_PIP", "Ring", "Ring_DIP_Sensor", 9, "17,18", "D9"),
    ("R2", "Ring_PIP", "Ring_MCP", "Ring", "Ring_PIP_Sensor", 10, "19,20", "D10"),
    ("R1", "Ring_MCP", "WristRoot", "Ring", "Ring_MCP_Sensor", 11, "21,22", "D11"),
    ("L3", "Little_DIP", "Little_PIP", "Little", "Little_DIP_Sensor", 12, "23,24", "D12"),
    ("L2", "Little_PIP", "Little_MCP", "Little", "Little_PIP_Sensor", 13, "25,26", "D13"),
    ("L1", "Little_MCP", "WristRoot", "Little", "Little_MCP_Sensor", 14, "27,28", "D14"),
]

FINGER_CHAINS = {
    "Thumb": ["T1", "T2"],
    "Index": ["I1", "I2", "I3"],
    "Middle": ["M1", "M2", "M3"],
    "Ring": ["R1", "R2", "R3"],
    "Little": ["L1", "L2", "L3"],
}

EXPECTED_PARTS = [
    "DeviceRoot", "MainFPC", "CircuitModule", "SignalConditioning",
    "AnalogMultiplexerArray", "ESP32Module", "IMUModule", "BatteryModule",
    "PowerManagement", "TypeCPort", "FingerFPC_Thumb", "FingerFPC_Index",
    "FingerFPC_ThumbBase", "FingerFPC_Middle", "FingerFPC_Ring", "FingerFPC_Little",
]


def round_list(values, digits: int = 6) -> list[float]:
    return [round(float(value), digits) for value in values]


def armature_modifier(obj: bpy.types.Object) -> bpy.types.Modifier | None:
    return next((modifier for modifier in obj.modifiers if modifier.type == "ARMATURE"), None)


def weight_stats(obj: bpy.types.Object) -> dict:
    weighted_vertices = 0
    cross_weighted_vertices = 0
    weight_sums: list[float] = []
    used_groups: dict[str, int] = {}
    for vertex in obj.data.vertices:
        active = []
        for membership in vertex.groups:
            if membership.weight <= 1e-6:
                continue
            group_name = obj.vertex_groups[membership.group].name
            active.append((group_name, float(membership.weight)))
            used_groups[group_name] = used_groups.get(group_name, 0) + 1
        if active:
            weighted_vertices += 1
            if len(active) > 1:
                cross_weighted_vertices += 1
            weight_sums.append(sum(weight for _, weight in active))
    total = len(obj.data.vertices)
    return {
        "vertices": total,
        "weighted_vertices": weighted_vertices,
        "unweighted_vertices": total - weighted_vertices,
        "cross_weighted_vertices": cross_weighted_vertices,
        "cross_weighted_ratio": round(cross_weighted_vertices / max(total, 1), 6),
        "weight_sum_min": round(min(weight_sums), 6) if weight_sums else None,
        "weight_sum_max": round(max(weight_sums), 6) if weight_sums else None,
        "weight_sum_mean": round(sum(weight_sums) / len(weight_sums), 6) if weight_sums else None,
        "used_groups": used_groups,
        "has_armature_modifier": armature_modifier(obj) is not None,
        "armature_target": getattr(getattr(armature_modifier(obj), "object", None), "name", None),
    }


def reset_pose(armature: bpy.types.Object) -> None:
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = (1, 0, 0, 0)
        pose_bone.location = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)


def set_uniform_pose(armature: bpy.types.Object, degrees: float) -> None:
    reset_pose(armature)
    radians = math.radians(-degrees)
    for _, bone_name, _, _, _, _, _, _ in JOINTS:
        pose_bone = armature.pose.bones.get(bone_name)
        if pose_bone:
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler = (radians, 0, 0)
    bpy.context.view_layer.update()


def evaluated_world_vertices(obj: bpy.types.Object) -> list[Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        matrix = evaluated.matrix_world
        return [matrix @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(evaluated_world_vertices(obj))
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return minimum, maximum


def min_distance(left: list[Vector], right: list[Vector]) -> float:
    # Validation meshes are deliberately small; sampled brute force is stable
    # and avoids any dependency beyond Blender's bundled Python.
    left_step = max(1, len(left) // 180)
    right_step = max(1, len(right) // 900)
    best = float("inf")
    for a in left[::left_step]:
        for b in right[::right_step]:
            best = min(best, (a - b).length)
    return float(best)


def mesh_component_count(obj: bpy.types.Object) -> int:
    if obj.type != "MESH" or not obj.data.vertices:
        return 0
    # glTF/Draco may split a geometric vertex at skin or normal seams. Weld by
    # quantized position before counting so the check measures visible geometry
    # continuity rather than exporter bookkeeping.
    vertex_keys = {
        vertex.index: tuple(round(float(value), 5) for value in vertex.co)
        for vertex in obj.data.vertices
    }
    adjacency: dict[tuple[float, float, float], set[tuple[float, float, float]]] = {
        key: set() for key in vertex_keys.values()
    }
    for edge in obj.data.edges:
        a, b = edge.vertices
        key_a, key_b = vertex_keys[a], vertex_keys[b]
        adjacency[key_a].add(key_b)
        adjacency[key_b].add(key_a)
    remaining = set(adjacency)
    components = 0
    while remaining:
        components += 1
        stack = [remaining.pop()]
        while stack:
            current = stack.pop()
            neighbours = adjacency[current] & remaining
            remaining.difference_update(neighbours)
            stack.extend(neighbours)
    return components


def evaluated_world_bvh(obj: bpy.types.Object) -> BVHTree:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        matrix = evaluated.matrix_world
        vertices = [matrix @ vertex.co for vertex in mesh.vertices]
        polygons = [tuple(polygon.vertices) for polygon in mesh.polygons]
        return BVHTree.FromPolygons(vertices, polygons, all_triangles=False)
    finally:
        evaluated.to_mesh_clear()


def meshes_overlap(left: bpy.types.Object, right: bpy.types.Object) -> bool:
    return bool(evaluated_world_bvh(left).overlap(evaluated_world_bvh(right)))


def sensor_alignment(sensor: bpy.types.Object, bone_name: str) -> dict:
    bone = armature.data.bones[bone_name]
    bone_direction = (
        (armature.matrix_world @ bone.tail_local) - (armature.matrix_world @ bone.head_local)
    ).normalized()
    points = [sensor.matrix_world @ vertex.co for vertex in sensor.data.vertices]
    mean_x = sum(point.x for point in points) / len(points)
    mean_y = sum(point.y for point in points) / len(points)
    covariance_xx = sum((point.x - mean_x) ** 2 for point in points) / len(points)
    covariance_xy = sum((point.x - mean_x) * (point.y - mean_y) for point in points) / len(points)
    covariance_yy = sum((point.y - mean_y) ** 2 for point in points) / len(points)
    trace = covariance_xx + covariance_yy
    determinant = covariance_xx * covariance_yy - covariance_xy * covariance_xy
    root = math.sqrt(max(trace * trace * 0.25 - determinant, 0.0))
    major = trace * 0.5 + root
    minor = max(trace * 0.5 - root, 1e-9)
    if abs(covariance_xy) > 1e-9:
        long_axis = Vector((major - covariance_yy, covariance_xy, 0)).normalized()
    else:
        long_axis = Vector((1, 0, 0)) if covariance_xx >= covariance_yy else Vector((0, 1, 0))
    ratio = math.sqrt(major / minor)
    axis_dot = abs(long_axis.dot(bone_direction))
    return {
        "axis_dot": round(axis_dot, 6),
        "length_width_ratio": round(ratio, 6),
        "aligned": axis_dot >= 0.95 and ratio >= 1.35,
    }


def setup_render() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("ValidationWorld")
    scene.world.color = (0.035, 0.045, 0.055)
    for obj in list(scene.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    camera_data = bpy.data.cameras.new("ValidationCamera")
    camera = bpy.data.objects.new("ValidationCamera", camera_data)
    scene.collection.objects.link(camera)
    camera.data.lens = 58
    camera.data.clip_start = 0.01
    camera.data.clip_end = 200
    scene.camera = camera
    for name, energy, size in (("Key", 980, 6.0), ("Fill", 620, 5.0), ("Rim", 780, 4.0)):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
    return camera


def aim_camera_and_lights(camera: bpy.types.Object, minimum: Vector, maximum: Vector) -> None:
    center = (minimum + maximum) * 0.5
    size = max(maximum - minimum)
    camera.location = center + Vector((size * 0.92, -size * 1.22, size * 1.05))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.clip_end = size * 30
    positions = [
        center + Vector((-size * 0.8, -size * 0.8, size * 1.6)),
        center + Vector((size * 1.2, -size * 0.2, size * 0.55)),
        center + Vector((0, size * 1.1, size * 1.1)),
    ]
    for name, position in zip(("Key", "Fill", "Rim"), positions):
        light = bpy.data.objects[name]
        light.location = position
        light.rotation_euler = (center - position).to_track_quat("-Z", "Y").to_euler()


armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
armature = next((obj for obj in armatures if obj.name == "HandRoot"), armatures[0] if armatures else None)
if armature is None:
    raise RuntimeError("HandRoot armature is missing")

object_by_name = {obj.name: obj for obj in bpy.context.scene.objects}
actual_bones = [bone.name for bone in armature.data.bones]

node_checks = {
    "missing_bones": [name for name in EXPECTED_BONES if name not in actual_bones],
    "unexpected_bones": [name for name in actual_bones if name not in EXPECTED_BONES],
    "missing_parts": [name for name in EXPECTED_PARTS if name not in object_by_name],
    "missing_sensors": [f"Sensor_{joint_id}" for joint_id, *_ in JOINTS if f"Sensor_{joint_id}" not in object_by_name],
    "missing_serpentines": [f"Serpentine_{joint_id}" for joint_id, *_ in JOINTS if f"Serpentine_{joint_id}" not in object_by_name],
    "missing_highlights": [f"Highlight_{joint_id}" for joint_id, *_ in JOINTS if f"Highlight_{joint_id}" not in object_by_name],
    "missing_anatomical_nodes": [anatomical_node for _, _, _, _, anatomical_node, *_ in JOINTS if anatomical_node not in object_by_name],
}

sensor_checks = []
for joint_id, bone_name, proximal_bone, finger, anatomical_node, channel, raw_channels, differential in JOINTS:
    sensor = object_by_name.get(f"Sensor_{joint_id}")
    highlight = object_by_name.get(f"Highlight_{joint_id}")
    weights = weight_stats(sensor) if sensor else None
    bone = armature.data.bones.get(bone_name)
    points = [sensor.matrix_world @ vertex.co for vertex in sensor.data.vertices] if sensor else []
    center = sum(points, Vector()) / len(points) if points else None
    axis = armature.matrix_world @ bone.head_local if bone else None
    center_axis_distance = Vector((center.x - axis.x, center.y - axis.y, 0)).length if center is not None and axis is not None else None
    sensor_checks.append({
        "id": joint_id,
        "sensor": sensor.name if sensor else None,
        "expected_bone": bone_name,
        "parent": sensor.parent.name if sensor and sensor.parent else None,
        "parent_type": sensor.parent_type if sensor else None,
        "parent_bone": sensor.parent_bone if sensor else None,
        "channel": sensor.get("channel") if sensor else None,
        "rawChannels": sensor.get("rawChannels") if sensor else None,
        "differential": sensor.get("differential") if sensor else None,
        "metadata_ok": bool(sensor and sensor.get("hsadId") == joint_id and sensor.get("channel") == channel
                            and sensor.get("rawChannels") == raw_channels and sensor.get("differential") == differential),
        "binding_ok": bool(sensor and armature_modifier(sensor) and weights
                           and proximal_bone in weights["used_groups"] and bone_name in weights["used_groups"]
                           and weights["cross_weighted_vertices"] > 0),
        "highlight_parent": highlight.parent.name if highlight and highlight.parent else None,
        "highlight_ok": bool(highlight and highlight.parent == armature and highlight.parent_bone == bone_name
                             and highlight.get("hsadId") == joint_id),
        "anatomical_node": anatomical_node,
        "anatomical_node_ok": anatomical_node in object_by_name,
        "center_to_joint_axis": round(center_axis_distance, 6) if center_axis_distance is not None else None,
        "centered_on_axis": bool(center_axis_distance is not None and center_axis_distance <= 0.08),
        "weight_stats": weights,
        "alignment": sensor_alignment(sensor, bone_name) if sensor else None,
        "finger": finger,
    })

deformation_objects = [
    *(f"Hand_{finger}" for finger in ("Index", "Middle", "Ring", "Little", "Thumb", "ThumbBase")),
    *(f"FingerFPC_{finger}" for finger in ("Index", "Middle", "Ring", "Little", "Thumb", "ThumbBase")),
    *(f"Serpentine_{joint_id}" for joint_id, *_ in JOINTS),
    *(f"Sensor_{joint_id}" for joint_id, *_ in JOINTS),
]
weight_checks = {
    name: weight_stats(object_by_name[name])
    for name in deformation_objects
    if name in object_by_name and object_by_name[name].type == "MESH"
}

device_root = object_by_name.get("DeviceRoot")
device_binding = {
    "parent": device_root.parent.name if device_root and device_root.parent else None,
    "parent_type": device_root.parent_type if device_root else None,
    "parent_bone": device_root.parent_bone if device_root else None,
    "rigid_to_wrist": bool(device_root and device_root.parent == armature and device_root.parent_type == "BONE"
                           and device_root.parent_bone == "WristRoot"),
}

main_fpc = object_by_name.get("MainFPC")
fpc_structure_checks = {}
for finger in FINGER_CHAINS:
    fpc = object_by_name.get(f"FingerFPC_{finger}")
    fpc_structure_checks[finger] = {
        "node": fpc.name if fpc else None,
        "mesh_components": mesh_component_count(fpc) if fpc and fpc.type == "MESH" else None,
        "single_continuous_mesh": bool(fpc and fpc.type == "MESH" and mesh_component_count(fpc) == 1),
        "overlaps_main_fpc": bool(fpc and main_fpc and meshes_overlap(fpc, main_fpc)),
    }

continuity_contract = {}
for finger, joint_ids in FINGER_CHAINS.items():
    previous = "MainFPC"
    links = []
    for joint_id in joint_ids:
        trace = object_by_name.get(f"Serpentine_{joint_id}")
        sensor = object_by_name.get(f"Sensor_{joint_id}")
        fpc = object_by_name.get(f"FingerFPC_{finger}")
        trace_sensor_gap = min_distance(evaluated_world_vertices(trace), evaluated_world_vertices(sensor)) if trace and sensor else None
        trace_fpc_gap = min_distance(evaluated_world_vertices(trace), evaluated_world_vertices(fpc)) if trace and fpc else None
        links.append({
            "trace": trace.name if trace else None,
            "sensor": sensor.name if sensor else None,
            "connects_from": trace.get("connectsFrom") if trace else None,
            "connects_to": trace.get("connectsTo") if trace else None,
            "metadata_ok": bool(
                trace
                and trace.get("connectsFrom") == previous
                and trace.get("connectsTo") == f"Sensor_{joint_id}"
                and trace.get("continuityGroup") == f"FPC_{finger}"
            ),
            "trace_overlaps_sensor": bool(trace and sensor and meshes_overlap(trace, sensor)),
            "trace_sensor_gap": round(trace_sensor_gap, 6) if trace_sensor_gap is not None else None,
            "trace_connected_sensor": bool(trace_sensor_gap is not None and trace_sensor_gap <= 0.085),
            "sensor_overlaps_fpc": bool(sensor and fpc and meshes_overlap(sensor, fpc)),
            "trace_overlaps_fpc": bool(trace and fpc and meshes_overlap(trace, fpc)),
            "trace_fpc_gap": round(trace_fpc_gap, 6) if trace_fpc_gap is not None else None,
            "trace_connected_fpc": bool(trace_fpc_gap is not None and trace_fpc_gap <= 0.12),
        })
        previous = f"Sensor_{joint_id}"
    continuity_contract[finger] = links

camera = setup_render()
render_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
pose_checks = []
for degrees in (0, 30, 60, 90):
    set_uniform_pose(armature, degrees)
    minimum, maximum = world_bounds(render_objects)
    aim_camera_and_lights(camera, minimum, maximum)
    output = output_dir / f"hsad_teaching_hand_pose_{degrees:02d}.png"
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)

    joint_proximity = {}
    for joint_id, _, _, finger, *_ in JOINTS:
        sensor = object_by_name.get(f"Sensor_{joint_id}")
        hand = object_by_name.get(f"Hand_{finger}")
        fpc = object_by_name.get(f"FingerFPC_{finger}")
        serpentine = object_by_name.get(f"Serpentine_{joint_id}")
        if not all((sensor, hand, fpc, serpentine)):
            continue
        sensor_vertices = evaluated_world_vertices(sensor)
        hand_vertices = evaluated_world_vertices(hand)
        fpc_vertices = evaluated_world_vertices(fpc)
        serpentine_vertices = evaluated_world_vertices(serpentine)
        joint_proximity[joint_id] = {
            "sensor_to_hand_min": round(min_distance(sensor_vertices, hand_vertices), 5),
            "sensor_to_fpc_min": round(min_distance(sensor_vertices, fpc_vertices), 5),
            "serpentine_to_sensor_min": round(min_distance(serpentine_vertices, sensor_vertices), 5),
            "serpentine_to_fpc_min": round(min_distance(serpentine_vertices, fpc_vertices), 5),
            "sensor_overlaps_fpc": meshes_overlap(sensor, fpc),
            "serpentine_overlaps_sensor": meshes_overlap(serpentine, sensor),
            "serpentine_overlaps_fpc": meshes_overlap(serpentine, fpc),
        }
    pose_checks.append({
        "degrees": degrees,
        "image": str(output),
        "bounds_min": round_list(minimum),
        "bounds_max": round_list(maximum),
        "joint_proximity": joint_proximity,
    })

reset_pose(armature)
bpy.context.view_layer.update()

triangle_count = sum(
    sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)
    for obj in render_objects
)
vertex_count = sum(len(obj.data.vertices) for obj in render_objects)

node_contract_ok = all(not values for values in node_checks.values())
sensor_contract_ok = all(
    item["metadata_ok"] and item["binding_ok"] and item["highlight_ok"]
    and item["anatomical_node_ok"] and item["centered_on_axis"] and item["alignment"]["aligned"]
    for item in sensor_checks
)
weights_ok = all(
    stats["unweighted_vertices"] == 0
    and stats["has_armature_modifier"]
    and stats["weight_sum_min"] is not None
    and abs(stats["weight_sum_min"] - 1.0) <= 2e-4
    and abs(stats["weight_sum_max"] - 1.0) <= 2e-4
    for stats in weight_checks.values()
)
fpc_mesh_ok = all(
    item["single_continuous_mesh"] and item["overlaps_main_fpc"]
    for item in fpc_structure_checks.values()
)
continuity_ok = all(
    link["metadata_ok"]
    and link["trace_connected_sensor"]
    and link["sensor_overlaps_fpc"]
    and link["trace_connected_fpc"]
    for links in continuity_contract.values()
    for link in links
)
pose_contact_ok = all(
    item["sensor_overlaps_fpc"]
    and item["serpentine_to_sensor_min"] <= 0.14
    and item["serpentine_to_fpc_min"] <= 0.14
    for pose in pose_checks
    for item in pose["joint_proximity"].values()
)
all_passed = all((
    node_contract_ok,
    sensor_contract_ok,
    weights_ok,
    device_binding["rigid_to_wrist"],
    fpc_mesh_ok,
    continuity_ok,
    pose_contact_ok,
))

report = {
    "blender_version": bpy.app.version_string,
    "source_blend": bpy.data.filepath,
    "object_count": len(bpy.context.scene.objects),
    "mesh_count": len(render_objects),
    "triangle_count": triangle_count,
    "vertex_count": vertex_count,
    "armature_count": len(armatures),
    "bone_count": len(actual_bones),
    "bones": actual_bones,
    "action_count": len(bpy.data.actions),
    "node_checks": node_checks,
    "sensor_checks": sensor_checks,
    "device_binding": device_binding,
    "fpc_structure_checks": fpc_structure_checks,
    "continuity_contract": continuity_contract,
    "weight_checks": weight_checks,
    "pose_checks": pose_checks,
    "acceptance": {
        "node_contract_ok": node_contract_ok,
        "sensor_contract_ok": sensor_contract_ok,
        "weights_ok": weights_ok,
        "device_rigid_ok": device_binding["rigid_to_wrist"],
        "fpc_mesh_ok": fpc_mesh_ok,
        "continuity_ok": continuity_ok,
        "pose_contact_ok": pose_contact_ok,
        "all_passed": all_passed,
    },
}

report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"HSAD_VALIDATION_REPORT={report_path}")
print(f"HSAD_VALIDATION_POSES={output_dir}")
print(f"HSAD_VALIDATION_TRIANGLES={triangle_count} HSAD_VALIDATION_BONES={len(actual_bones)}")
print(f"HSAD_VALIDATION_PASSED={all_passed}")
if not all_passed:
    raise RuntimeError("HSAD teaching hand failed structural acceptance; inspect the JSON report")
