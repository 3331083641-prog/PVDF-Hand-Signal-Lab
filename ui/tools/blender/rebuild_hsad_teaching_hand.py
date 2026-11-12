"""Build a web-ready, rigged HSAD teaching hand from audited source assets.

The source Blend is used for finger segment proportions and the previously
derived working Blend is used as the high-density FBX outline reference.  The
final geometry is deliberately simplified for teaching: a continuous glove,
an articulated FPC ribbon system, semantic sensor nodes, and visible-but-simple
electronic modules whose placement follows the thesis and EasyEDA project.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def argv_after_separator() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


parser = argparse.ArgumentParser()
parser.add_argument("--reference-blend", required=True)
parser.add_argument("--working-reference")
parser.add_argument("--reference-fbx")
parser.add_argument("--glove-reference-fbx")
parser.add_argument("--output-blend", required=True)
parser.add_argument("--output-glb", required=True)
parser.add_argument("--report", required=True)
parser.add_argument("--preview", required=True)
args = parser.parse_args(argv_after_separator())

reference_blend = Path(args.reference_blend).resolve()
working_reference = Path(args.working_reference).resolve() if args.working_reference else None
reference_fbx = Path(args.reference_fbx).resolve() if args.reference_fbx else None
glove_reference_fbx = Path(args.glove_reference_fbx).resolve() if args.glove_reference_fbx else None
output_blend = Path(args.output_blend).resolve()
output_glb = Path(args.output_glb).resolve()
report_path = Path(args.report).resolve()
preview_path = Path(args.preview).resolve()
for path in (output_blend, output_glb, report_path, preview_path):
    path.parent.mkdir(parents=True, exist_ok=True)


SOURCE_BONE_MAP = {
    "骨骼": "WristRoot",
    "骨骼.003": "Index_MCP", "骨骼.004": "Index_PIP", "骨骼.005": "Index_DIP",
    "骨骼.006": "Middle_MCP", "骨骼.008": "Middle_PIP", "骨骼.009": "Middle_DIP",
    "骨骼.010": "Ring_MCP", "骨骼.012": "Ring_PIP", "骨骼.013": "Ring_DIP",
    "骨骼.014": "Little_MCP", "骨骼.016": "Little_PIP", "骨骼.017": "Little_DIP",
    "骨骼.007": "Thumb_CMC", "骨骼.011": "Thumb_MCP", "骨骼.015": "Thumb_IP",
}

JOINTS = [
    {"id": "T2", "finger": "Thumb", "jointType": "IP", "bone": "Thumb_IP", "proximalBone": "Thumb_MCP", "anatomicalName": "拇指指间关节", "anatomicalNode": "Thumb_IP_Sensor", "channel": 1, "raw": [1, 2], "diff": "D1"},
    {"id": "T1", "finger": "Thumb", "jointType": "MCP", "bone": "Thumb_MCP", "proximalBone": "Thumb_CMC", "anatomicalName": "拇指掌指关节", "anatomicalNode": "Thumb_MCP_Sensor", "channel": 2, "raw": [3, 4], "diff": "D2"},
    {"id": "I3", "finger": "Index", "jointType": "DIP", "bone": "Index_DIP", "proximalBone": "Index_PIP", "anatomicalName": "食指远端指间关节", "anatomicalNode": "Index_DIP_Sensor", "channel": 3, "raw": [5, 6], "diff": "D3"},
    {"id": "I2", "finger": "Index", "jointType": "PIP", "bone": "Index_PIP", "proximalBone": "Index_MCP", "anatomicalName": "食指近端指间关节", "anatomicalNode": "Index_PIP_Sensor", "channel": 4, "raw": [7, 8], "diff": "D4"},
    {"id": "I1", "finger": "Index", "jointType": "MCP", "bone": "Index_MCP", "proximalBone": "WristRoot", "anatomicalName": "食指掌指关节", "anatomicalNode": "Index_MCP_Sensor", "channel": 5, "raw": [9, 10], "diff": "D5"},
    {"id": "M3", "finger": "Middle", "jointType": "DIP", "bone": "Middle_DIP", "proximalBone": "Middle_PIP", "anatomicalName": "中指远端指间关节", "anatomicalNode": "Middle_DIP_Sensor", "channel": 6, "raw": [11, 12], "diff": "D6"},
    {"id": "M2", "finger": "Middle", "jointType": "PIP", "bone": "Middle_PIP", "proximalBone": "Middle_MCP", "anatomicalName": "中指近端指间关节", "anatomicalNode": "Middle_PIP_Sensor", "channel": 7, "raw": [13, 14], "diff": "D7"},
    {"id": "M1", "finger": "Middle", "jointType": "MCP", "bone": "Middle_MCP", "proximalBone": "WristRoot", "anatomicalName": "中指掌指关节", "anatomicalNode": "Middle_MCP_Sensor", "channel": 8, "raw": [15, 16], "diff": "D8"},
    {"id": "R3", "finger": "Ring", "jointType": "DIP", "bone": "Ring_DIP", "proximalBone": "Ring_PIP", "anatomicalName": "无名指远端指间关节", "anatomicalNode": "Ring_DIP_Sensor", "channel": 9, "raw": [17, 18], "diff": "D9"},
    {"id": "R2", "finger": "Ring", "jointType": "PIP", "bone": "Ring_PIP", "proximalBone": "Ring_MCP", "anatomicalName": "无名指近端指间关节", "anatomicalNode": "Ring_PIP_Sensor", "channel": 10, "raw": [19, 20], "diff": "D10"},
    {"id": "R1", "finger": "Ring", "jointType": "MCP", "bone": "Ring_MCP", "proximalBone": "WristRoot", "anatomicalName": "无名指掌指关节", "anatomicalNode": "Ring_MCP_Sensor", "channel": 11, "raw": [21, 22], "diff": "D11"},
    {"id": "L3", "finger": "Little", "jointType": "DIP", "bone": "Little_DIP", "proximalBone": "Little_PIP", "anatomicalName": "小指远端指间关节", "anatomicalNode": "Little_DIP_Sensor", "channel": 12, "raw": [23, 24], "diff": "D12"},
    {"id": "L2", "finger": "Little", "jointType": "PIP", "bone": "Little_PIP", "proximalBone": "Little_MCP", "anatomicalName": "小指近端指间关节", "anatomicalNode": "Little_PIP_Sensor", "channel": 13, "raw": [25, 26], "diff": "D13"},
    {"id": "L1", "finger": "Little", "jointType": "MCP", "bone": "Little_MCP", "proximalBone": "WristRoot", "anatomicalName": "小指掌指关节", "anatomicalNode": "Little_MCP_Sensor", "channel": 14, "raw": [27, 28], "diff": "D14"},
]

CHAIN_IDS = {
    "Thumb": ["T1", "T2"],
    "Index": ["I1", "I2", "I3"],
    "Middle": ["M1", "M2", "M3"],
    "Ring": ["R1", "R2", "R3"],
    "Little": ["L1", "L2", "L3"],
}


def sha256(path: Path | None) -> str | None:
    if not path or not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audit_reference_blend(path: Path) -> tuple[dict[str, float], dict]:
    bpy.ops.wm.open_mainfile(filepath=str(path))
    armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
    lengths: dict[str, float] = {}
    if armature:
        for source_name, semantic_name in SOURCE_BONE_MAP.items():
            bone = armature.data.bones.get(source_name)
            if bone:
                lengths[semantic_name] = float(bone.length)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    audit = {
        "path": str(path),
        "objects": len(bpy.context.scene.objects),
        "meshes": len(meshes),
        "triangles": sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes),
        "armatures": sum(1 for obj in bpy.context.scene.objects if obj.type == "ARMATURE"),
        "source_bone_lengths": lengths,
    }
    return lengths, audit


def audit_working_reference(path: Path | None) -> dict | None:
    if not path or not path.exists():
        return None
    bpy.ops.wm.open_mainfile(filepath=str(path))
    main = bpy.data.objects.get("MainFPC")
    return {
        "path": str(path),
        "main_fpc_dimensions": [round(float(v), 6) for v in main.dimensions] if main else None,
        "triangles": sum(
            sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
            for obj in bpy.context.scene.objects if obj.type == "MESH"
        ),
    }


source_lengths, source_audit = audit_reference_blend(reference_blend)
working_audit = audit_working_reference(working_reference)
bpy.ops.wm.read_factory_settings(use_empty=True)


def normalized_lengths(names: list[str], total: float, defaults: list[float]) -> list[float]:
    values = [source_lengths.get(name, default) for name, default in zip(names, defaults)]
    denominator = max(sum(values), 1e-6)
    return [total * value / denominator for value in values]


finger_lengths = {
    "Index": normalized_lengths(["Index_MCP", "Index_PIP", "Index_DIP"], 3.28, [1.35, 1.06, 0.87]),
    "Middle": normalized_lengths(["Middle_MCP", "Middle_PIP", "Middle_DIP"], 3.55, [1.46, 1.16, 0.93]),
    "Ring": normalized_lengths(["Ring_MCP", "Ring_PIP", "Ring_DIP"], 3.34, [1.38, 1.08, 0.88]),
    "Little": normalized_lengths(["Little_MCP", "Little_PIP", "Little_DIP"], 2.78, [1.18, 0.90, 0.70]),
    "Thumb": normalized_lengths(["Thumb_MCP", "Thumb_IP"], 2.13, [1.13, 1.00]),
}


def principled(material: bpy.types.Material):
    material.use_nodes = True
    return material.node_tree.nodes.get("Principled BSDF")


def make_material(name: str, color: tuple[float, float, float, float], roughness: float, metallic: float = 0.0,
                  emission: tuple[float, float, float, float] | None = None) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    node = principled(material)
    if node:
        if "Base Color" in node.inputs:
            node.inputs["Base Color"].default_value = color
        if "Roughness" in node.inputs:
            node.inputs["Roughness"].default_value = roughness
        if "Metallic" in node.inputs:
            node.inputs["Metallic"].default_value = metallic
        if emission:
            if "Emission Color" in node.inputs:
                node.inputs["Emission Color"].default_value = emission
            elif "Emission" in node.inputs:
                node.inputs["Emission"].default_value = emission
            if "Emission Strength" in node.inputs:
                node.inputs["Emission Strength"].default_value = 0.35
    return material


MAT_HAND = make_material("HSAD_Glove_Graphite", (0.055, 0.07, 0.075, 1), 0.68)
MAT_FPC = make_material("HSAD_FPC_Polyimide", (0.83, 0.31, 0.035, 1), 0.36, 0.08)
MAT_COPPER = make_material("HSAD_Copper_Pad", (0.96, 0.49, 0.055, 1), 0.28, 0.16)
MAT_TRACE = make_material("HSAD_Copper_Trace", (1.0, 0.64, 0.12, 1), 0.26, 0.22)
MAT_BOARD = make_material("HSAD_Circuit_Substrate", (0.035, 0.12, 0.17, 1), 0.46, 0.02)
MAT_CHIP = make_material("HSAD_Chip", (0.025, 0.03, 0.035, 1), 0.34, 0.08)
MAT_SILVER = make_material("HSAD_Module_Shield", (0.58, 0.64, 0.65, 1), 0.3, 0.68)
MAT_IMU = make_material("HSAD_IMU", (0.02, 0.35, 0.42, 1), 0.34, 0.08)
MAT_BATTERY = make_material("HSAD_Internal_Battery", (0.38, 0.42, 0.43, 1), 0.5, 0.32)
MAT_POWER = make_material("HSAD_Power", (0.64, 0.16, 0.055, 1), 0.4, 0.12)


# ---------------------------------------------------------------------------
# Armature: one root/helper plus the fourteen measured joints.
# ---------------------------------------------------------------------------

arm_data = bpy.data.armatures.new("HSAD_Teaching_Armature")
armature = bpy.data.objects.new("HandRoot", arm_data)
bpy.context.scene.collection.objects.link(armature)
armature["system"] = "HSAD"
armature["jointCount"] = 14

finger_x = {"Index": 0.98, "Middle": 0.33, "Ring": -0.38, "Little": -1.00}
finger_base_y = {"Index": 0.92, "Middle": 1.00, "Ring": 0.93, "Little": 0.79}

bpy.context.view_layer.objects.active = armature
armature.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

root = arm_data.edit_bones.new("WristRoot")
root.head = (0, -2.55, 0)
root.tail = (0, 0.74, 0)
root["role"] = "root"

for finger in ("Index", "Middle", "Ring", "Little"):
    x = finger_x[finger]
    y = finger_base_y[finger]
    lengths = finger_lengths[finger]
    previous = root
    head = Vector((x, y, 0))
    for suffix, length in zip(("MCP", "PIP", "DIP"), lengths):
        bone = arm_data.edit_bones.new(f"{finger}_{suffix}")
        bone.head = head
        bone.tail = head + Vector((0, length, 0))
        bone.parent = previous
        bone.use_connect = previous != root
        bone.roll = 0
        previous = bone
        head = bone.tail.copy()

thumb_cmc = arm_data.edit_bones.new("Thumb_CMC")
thumb_cmc.head = (1.30, -0.62, -0.02)
thumb_cmc.tail = (1.83, -0.18, 0)
thumb_cmc.parent = root
thumb_cmc.use_connect = False
thumb_cmc.roll = 0

thumb_direction = Vector((0.80, 0.60, 0)).normalized()
previous = thumb_cmc
head = thumb_cmc.tail.copy()
for suffix, length in zip(("MCP", "IP"), finger_lengths["Thumb"]):
    bone = arm_data.edit_bones.new(f"Thumb_{suffix}")
    bone.head = head
    bone.tail = head + thumb_direction * length
    bone.parent = previous
    bone.use_connect = True
    bone.roll = 0
    previous = bone
    head = bone.tail.copy()

bpy.ops.object.mode_set(mode="OBJECT")
for joint in JOINTS:
    bone = arm_data.bones.get(joint["bone"])
    if bone:
        bone["hsadId"] = joint["id"]
        bone["channel"] = joint["channel"]
        bone["rawChannels"] = ",".join(str(v) for v in joint["raw"])
        bone["differential"] = joint["diff"]


def add_armature_modifier(obj: bpy.types.Object) -> None:
    modifier = obj.modifiers.new("HSAD_Armature_Deform", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    obj.matrix_parent_inverse = armature.matrix_world.inverted()


def smooth_mesh(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def assign_weight(obj: bpy.types.Object, vertex_index: int, weights: dict[str, float]) -> None:
    for bone_name, weight in weights.items():
        if weight <= 1e-5:
            continue
        group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
        group.add([vertex_index], float(weight), "REPLACE")


def sample_weights(chain: list[str], segment: int, u: float, root_name: str = "WristRoot") -> dict[str, float]:
    current = chain[segment]
    if segment == 0 and u < 0.20:
        t = u / 0.20
        return {root_name: 1 - t, current: t}
    if segment > 0 and u < 0.20:
        t = u / 0.20
        return {chain[segment - 1]: 1 - t, current: t}
    if segment < len(chain) - 1 and u > 0.80:
        t = (u - 0.80) / 0.20
        return {current: 1 - t, chain[segment + 1]: t}
    return {current: 1.0}


def chain_geometry(chain: list[str], radii: list[float], samples_per_bone: int = 8):
    samples: list[dict] = []
    for segment, bone_name in enumerate(chain):
        bone = arm_data.bones[bone_name]
        for step in range(0 if segment == 0 else 1, samples_per_bone + 1):
            u = step / samples_per_bone
            center = bone.head_local.lerp(bone.tail_local, u)
            radius = radii[segment] * (1 - u) + radii[segment + 1] * u
            samples.append({
                "center": center,
                "radius": radius,
                "segment": segment,
                "u": u,
                "weights": sample_weights(
                    chain,
                    segment,
                    u,
                    "WristRoot" if chain[0] == "Thumb_CMC" else ("Thumb_CMC" if chain[0].startswith("Thumb") else "WristRoot"),
                ),
            })
    return samples


def create_finger_mesh(name: str, chain: list[str], radii: list[float]) -> bpy.types.Object:
    samples = chain_geometry(chain, radii)
    radial = 18
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    vertex_weights: list[dict[str, float]] = []

    for index, sample in enumerate(samples):
        prev_center = samples[max(0, index - 1)]["center"]
        next_center = samples[min(len(samples) - 1, index + 1)]["center"]
        tangent = (next_center - prev_center).normalized()
        lateral = Vector((tangent.y, -tangent.x, 0)).normalized()
        vertical = lateral.cross(tangent).normalized()
        radius = sample["radius"]
        for ring_index in range(radial):
            angle = 2 * math.pi * ring_index / radial
            point = sample["center"] + lateral * (math.cos(angle) * radius) + vertical * (math.sin(angle) * radius * 0.84)
            vertices.append(tuple(point))
            vertex_weights.append(sample["weights"])

    for ring in range(len(samples) - 1):
        for side in range(radial):
            nxt = (side + 1) % radial
            a = ring * radial + side
            b = ring * radial + nxt
            c = (ring + 1) * radial + nxt
            d = (ring + 1) * radial + side
            faces.append((a, b, c, d))

    start_center_index = len(vertices)
    vertices.append(tuple(samples[0]["center"]))
    vertex_weights.append(samples[0]["weights"])
    end_center_index = len(vertices)
    vertices.append(tuple(samples[-1]["center"]))
    vertex_weights.append(samples[-1]["weights"])
    for side in range(radial):
        nxt = (side + 1) % radial
        faces.append((start_center_index, nxt, side))
        last = (len(samples) - 1) * radial
        faces.append((end_center_index, last + side, last + nxt))

    mesh = bpy.data.meshes.new(f"{name}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(MAT_HAND)
    for vertex_index, weights in enumerate(vertex_weights):
        assign_weight(obj, vertex_index, weights)
    add_armature_modifier(obj)
    smooth_mesh(obj)
    return obj


finger_specs = {
    "Index": (["Index_MCP", "Index_PIP", "Index_DIP"], [0.31, 0.285, 0.245, 0.205]),
    "Middle": (["Middle_MCP", "Middle_PIP", "Middle_DIP"], [0.325, 0.30, 0.255, 0.21]),
    "Ring": (["Ring_MCP", "Ring_PIP", "Ring_DIP"], [0.31, 0.282, 0.24, 0.20]),
    "Little": (["Little_MCP", "Little_PIP", "Little_DIP"], [0.275, 0.245, 0.205, 0.17]),
    "Thumb": (["Thumb_MCP", "Thumb_IP"], [0.37, 0.31, 0.245]),
}

hand_meshes = [create_finger_mesh(f"Hand_{finger}", chain, radii) for finger, (chain, radii) in finger_specs.items()]
hand_meshes.append(create_finger_mesh("Hand_ThumbBase", ["Thumb_CMC"], [0.47, 0.37]))


def create_rounded_box(name: str, location: Vector | tuple[float, float, float], dimensions: tuple[float, float, float],
                       material: bpy.types.Material, bevel_width: float = 0.06) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("Soft_Edges", "BEVEL")
    bevel.width = min(bevel_width, min(dimensions) * 0.42)
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.data.materials.append(material)
    smooth_mesh(obj)
    return obj


# Palm and wrist are rounded volumes rather than a stack of card-like meshes.
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=28, location=(0, -0.36, 0))
palm = bpy.context.object
palm.name = "HandMesh"
palm.scale = (1.76, 1.66, 0.47)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
palm.data.materials.append(MAT_HAND)
root_group = palm.vertex_groups.new(name="WristRoot")
root_group.add(list(range(len(palm.data.vertices))), 1.0, "REPLACE")
add_armature_modifier(palm)
smooth_mesh(palm)
hand_meshes.append(palm)

wrist = create_rounded_box("Hand_Wrist", (0, -2.08, -0.02), (2.35, 1.05, 0.78), MAT_HAND, 0.24)
root_group = wrist.vertex_groups.new(name="WristRoot")
root_group.add(list(range(len(wrist.data.vertices))), 1.0, "REPLACE")
add_armature_modifier(wrist)
hand_meshes.append(wrist)

# Thumb mound closes the thumb/palm junction visually.
bpy.ops.mesh.primitive_uv_sphere_add(segments=30, ring_count=18, location=(1.30, -0.40, -0.01))
thumb_mound = bpy.context.object
thumb_mound.name = "Hand_Thenar"
thumb_mound.scale = (0.72, 0.82, 0.43)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
thumb_mound.data.materials.append(MAT_HAND)
group = thumb_mound.vertex_groups.new(name="WristRoot")
group.add(list(range(len(thumb_mound.data.vertices))), 1.0, "REPLACE")
add_armature_modifier(thumb_mound)
smooth_mesh(thumb_mound)
hand_meshes.append(thumb_mound)


def create_ribbon(name: str, samples: list[dict], width: float, thickness: float,
                  material: bpy.types.Material, lateral_offsets: list[float] | None = None) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    weights: list[dict[str, float]] = []
    for index, sample in enumerate(samples):
        prev_center = samples[max(0, index - 1)]["center"]
        next_center = samples[min(len(samples) - 1, index + 1)]["center"]
        tangent = (next_center - prev_center).normalized()
        lateral = Vector((tangent.y, -tangent.x, 0)).normalized()
        offset = lateral_offsets[index] if lateral_offsets else 0.0
        surface_lift = sample.get("surface_lift", sample["radius"] * 0.85 + 0.04)
        center = sample["center"] + lateral * offset + Vector((0, 0, surface_lift))
        for z_offset in (0, thickness):
            vertices.append(tuple(center - lateral * width * 0.5 + Vector((0, 0, z_offset))))
            vertices.append(tuple(center + lateral * width * 0.5 + Vector((0, 0, z_offset))))
            weights.extend([sample["weights"], sample["weights"]])
    for index in range(len(samples) - 1):
        a = index * 4
        b = (index + 1) * 4
        faces.extend([
            (a, b, b + 1, a + 1),
            (a + 2, a + 3, b + 3, b + 2),
            (a, a + 2, b + 2, b),
            (a + 1, b + 1, b + 3, a + 3),
        ])
    # Close both ends. Apart from improving export normals, closed end faces
    # make the intended geometric overlap between trace and pad verifiable.
    faces.append((0, 1, 3, 2))
    last = (len(samples) - 1) * 4
    faces.append((last, last + 2, last + 3, last + 1))
    mesh = bpy.data.meshes.new(f"{name}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    for vertex_index, vertex_weights in enumerate(weights):
        assign_weight(obj, vertex_index, vertex_weights)
    add_armature_modifier(obj)
    obj["partId"] = "fpc"
    obj["hsadPartId"] = "fpc"
    return obj


FPC_WIDTHS = {
    "Thumb": 0.36,
    "Index": 0.33,
    "Middle": 0.34,
    "Ring": 0.31,
    "Little": 0.28,
}


def palm_bridge_samples(finger: str, chain: list[str], radii: list[float], count: int = 9) -> list[dict]:
    """Connect the main palm FPC to a finger ribbon with real overlapping geometry.

    The first samples sit inside the rectangular MainFPC footprint, then ramp
    down to the finger surface. The bridge is skinned across WristRoot and the
    first measured bone so it stays attached during flexion.
    """
    first_bone = arm_data.bones[chain[0]]
    end = first_bone.head_local.copy()
    start = Vector((finger_x[finger], 0.62, 0))
    samples: list[dict] = []
    for step in range(count):
        t = step / max(count - 1, 1)
        eased = t * t * (3 - 2 * t)
        radius = radii[0]
        samples.append({
            "center": start.lerp(end, eased),
            "radius": radius,
            "segment": 0,
            "u": 0.0,
            "surface_lift": (1 - eased) * 0.535 + eased * (radius * 0.85 + 0.04),
            "weights": {"WristRoot": 1 - eased, chain[0]: eased},
        })
    return samples


def thumb_fpc_samples() -> list[dict]:
    """One continuous palm-to-tip FPC ribbon for the thumb."""
    chain = ["Thumb_CMC", "Thumb_MCP", "Thumb_IP"]
    radii = [0.47, 0.37, 0.31, 0.245]
    samples = chain_geometry(chain, radii, 14)
    # The CMC root lies over the palm. Blend its height from the MainFPC surface
    # to the thumb surface instead of leaving two floating ribbon pieces.
    cmc_count = sum(1 for sample in samples if sample["segment"] == 0)
    for index, sample in enumerate(samples[:cmc_count]):
        t = index / max(cmc_count - 1, 1)
        normal_lift = sample["radius"] * 0.85 + 0.04
        sample["surface_lift"] = (1 - t) * 0.535 + t * normal_lift
    return samples


fpc_objects: list[bpy.types.Object] = []
finger_samples: dict[str, list[dict]] = {}
for finger in ("Index", "Middle", "Ring", "Little"):
    chain, radii = finger_specs[finger]
    bridge = palm_bridge_samples(finger, chain, radii)
    articulated = chain_geometry(chain, radii, 14)
    # Skip the duplicated MCP-head sample. The remaining mesh is a single,
    # continuous strip from the palm rectangle to the fingertip.
    samples = bridge + articulated[1:]
    finger_samples[finger] = samples
    fpc_objects.append(create_ribbon(f"FingerFPC_{finger}", samples, FPC_WIDTHS[finger], 0.040, MAT_FPC))

finger_samples["Thumb"] = thumb_fpc_samples()
fpc_objects.append(create_ribbon("FingerFPC_Thumb", finger_samples["Thumb"], FPC_WIDTHS["Thumb"], 0.040, MAT_FPC))

# Kept as a semantic compatibility node. The visible thumb backing is now the
# single FingerFPC_Thumb mesh above, so there is no disconnected base strip.
thumb_base_semantic = bpy.data.objects.new("FingerFPC_ThumbBase", None)
bpy.context.scene.collection.objects.link(thumb_base_semantic)
thumb_base_semantic["partId"] = "fpc"
thumb_base_semantic["hsadPartId"] = "fpc"


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def parent_to_bone(obj: bpy.types.Object, bone_name: str) -> None:
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world


# Main FPC and visible electronics use one rigid DeviceRoot on the hand back.
device_root = bpy.data.objects.new("DeviceRoot", None)
bpy.context.scene.collection.objects.link(device_root)
parent_to_bone(device_root, "WristRoot")
device_root["partId"] = "acquisition"
device_root["hsadPartId"] = "acquisition"

main_fpc = create_rounded_box("MainFPC", (0, -0.30, 0.49), (2.90, 2.08, 0.105), MAT_FPC, 0.13)
parent_keep_world(main_fpc, device_root)
main_fpc["partId"] = "fpc"
main_fpc["hsadPartId"] = "fpc"

circuit = create_rounded_box("CircuitModule", (0, -0.43, 0.59), (2.24, 1.42, 0.105), MAT_BOARD, 0.085)
parent_keep_world(circuit, device_root)
circuit["partId"] = "acquisition"
circuit["hsadPartId"] = "acquisition"

# Palm branch traces visually join the rigid main board to the skinned finger ribbons.
for index, finger in enumerate(("Index", "Middle", "Ring", "Little")):
    x = finger_x[finger]
    start_y = -0.02
    # End at the MCP head. The skinned FingerFPC root supplies the actual
    # WristRoot→MCP bridge, so no rigid strip protrudes when the finger bends.
    end_y = 0.68
    length = end_y - start_y
    trace = create_rounded_box(f"PalmTrace_{finger}", (x, start_y + length * 0.5, 0.555), (0.12, length, 0.028), MAT_TRACE, 0.020)
    parent_keep_world(trace, device_root)
thumb_trace = create_rounded_box("PalmTrace_Thumb", (1.18, -0.50, 0.555), (0.64, 0.12, 0.028), MAT_TRACE, 0.020)
thumb_trace.rotation_euler[2] = math.radians(-40)
parent_keep_world(thumb_trace, device_root)

# Seven-channel signal-conditioning array: grouped and positioned as a module,
# not exposed as a false exact footprint replica.
conditioning = bpy.data.objects.new("SignalConditioning", None)
bpy.context.scene.collection.objects.link(conditioning)
parent_keep_world(conditioning, device_root)
conditioning["partId"] = "conditioning"
conditioning["hsadPartId"] = "conditioning"
for index in range(7):
    row, column = divmod(index, 4)
    chip = create_rounded_box(
        f"ChargeAmplifier_{index + 1:02d}",
        (-0.86 + column * 0.42, 0.01 - row * 0.43, 0.70),
        (0.28, 0.24, 0.095), MAT_CHIP, 0.025,
    )
    parent_keep_world(chip, conditioning)

# Four analog multiplexers occupy their own compact row.
mux_group = bpy.data.objects.new("AnalogMultiplexerArray", None)
bpy.context.scene.collection.objects.link(mux_group)
parent_keep_world(mux_group, device_root)
for index in range(4):
    mux = create_rounded_box(f"TMUX1574_{index + 1}", (-0.72 + index * 0.48, -0.72, 0.70), (0.30, 0.22, 0.08), MAT_CHIP, 0.02)
    parent_keep_world(mux, mux_group)

esp32_board = create_rounded_box("ESP32Module", (0.48, -0.25, 0.73), (0.78, 0.92, 0.12), MAT_CHIP, 0.06)
parent_keep_world(esp32_board, device_root)
esp32_board["partId"] = "esp32"
esp32_board["hsadPartId"] = "esp32"
esp32_shield = create_rounded_box("ESP32_Shield", (0.48, -0.31, 0.81), (0.62, 0.56, 0.07), MAT_SILVER, 0.035)
parent_keep_world(esp32_shield, esp32_board)

power_group = bpy.data.objects.new("PowerManagement", None)
bpy.context.scene.collection.objects.link(power_group)
parent_keep_world(power_group, device_root)
power_group["partId"] = "power"
power_group["hsadPartId"] = "power"
for name, location, dimensions in (
    ("TP4057_Charge", (-0.92, -0.82, 0.71), (0.25, 0.20, 0.08)),
    ("LDO_Regulator", (-0.58, -0.83, 0.71), (0.22, 0.18, 0.075)),
    ("REF2033_Reference", (-0.28, -0.84, 0.71), (0.22, 0.18, 0.075)),
):
    component = create_rounded_box(name, location, dimensions, MAT_POWER if name.startswith("TP") else MAT_CHIP, 0.02)
    parent_keep_world(component, power_group)
type_c = create_rounded_box("TypeCPort", (0, -1.18, 0.64), (0.46, 0.24, 0.18), MAT_SILVER, 0.05)
parent_keep_world(type_c, power_group)

# IMU and battery sit in the FPC sandwich; they become visible from the side or
# underside when the user rotates the model.
imu = create_rounded_box("IMUModule", (0.68, 0.27, 0.33), (0.54, 0.48, 0.12), MAT_IMU, 0.05)
parent_keep_world(imu, device_root)
imu["partId"] = "imu"
imu["hsadPartId"] = "imu"

battery = create_rounded_box("BatteryModule", (-0.36, -0.38, 0.27), (1.46, 1.08, 0.16), MAT_BATTERY, 0.10)
parent_keep_world(battery, device_root)
battery["partId"] = "battery"
battery["hsadPartId"] = "battery"

# Small passive components add engineering legibility without pretending to be
# a pin-accurate photogrammetry scan.
for index in range(18):
    row, column = divmod(index, 6)
    passive = create_rounded_box(
        f"SMD_{index + 1:02d}",
        (-0.98 + column * 0.39, 0.56 - row * 0.16, 0.685),
        (0.12, 0.055, 0.045), MAT_SILVER if index % 3 == 0 else MAT_CHIP, 0.012,
    )
    parent_keep_world(passive, device_root)


# Semantic sensor pads and continuous serpentine traces. Each PVDF pad is
# centred on the anatomical rotation axis and spans the proximal and distal
# segments. It is skinned to both bones so it bends across the joint instead of
# behaving like a rigid chip attached to the middle of one phalanx.
joint_by_id = {joint["id"]: joint for joint in JOINTS}
bone_radii: dict[str, float] = {}
for _, (chain, radii) in finger_specs.items():
    for index, bone_name in enumerate(chain):
        bone_radii[bone_name] = (radii[index] + radii[index + 1]) * 0.5
bone_radii["Thumb_CMC"] = (0.47 + 0.37) * 0.5

sensor_nodes: list[bpy.types.Object] = []
serpentine_nodes: list[bpy.types.Object] = []
sensor_layout: dict[str, dict] = {}


PAD_LENGTHS = {
    "MCP": 0.86,
    "PIP": 0.78,
    "DIP": 0.70,
    "IP": 0.72,
}


def smoothstep(value: float) -> float:
    clamped = max(0.0, min(1.0, value))
    return clamped * clamped * (3.0 - 2.0 * clamped)


def joint_sensor_samples(joint: dict, pad_length: float, count: int = 17) -> tuple[list[dict], dict]:
    distal = arm_data.bones[joint["bone"]]
    proximal_name = joint["proximalBone"]
    proximal = arm_data.bones[proximal_name]
    rig_chain = ["Thumb_CMC", "Thumb_MCP", "Thumb_IP"] if joint["finger"] == "Thumb" else finger_specs[joint["finger"]][0]
    axis = distal.head_local.copy()
    distal_direction = (distal.tail_local - distal.head_local).normalized()

    # Four-finger MCP pads extend over the palm in the same longitudinal
    # direction as the finger. Thumb MCP/IP use their own oblique proximal
    # bones and therefore cannot accidentally inherit a four-finger rotation.
    if proximal_name == "WristRoot":
        proximal_direction = distal_direction
        entry = axis - proximal_direction * pad_length * 0.48
        entry_segment = None
        entry_u = None
    else:
        proximal_direction = (proximal.tail_local - proximal.head_local).normalized()
        proximal_span = min(pad_length * 0.48, float(proximal.length) * 0.42)
        entry_u = max(0.04, 1.0 - proximal_span / max(float(proximal.length), 1e-6))
        entry = proximal.head_local.lerp(proximal.tail_local, entry_u)
        entry_segment = rig_chain.index(proximal_name)

    distal_span = min(pad_length * 0.52, float(distal.length) * 0.42)
    exit_u = min(0.46, distal_span / max(float(distal.length), 1e-6))
    exit_point = distal.head_local.lerp(distal.tail_local, exit_u)
    radius = bone_radii[joint["bone"]]
    distal_surface_lift = radius * 0.85 + 0.073
    if proximal_name == "WristRoot":
        proximal_surface_lift = 0.535
    else:
        proximal_radius = bone_radii.get(proximal_name, radius)
        proximal_surface_lift = proximal_radius * 0.85 + 0.073

    samples: list[dict] = []
    for index in range(count):
        t = index / max(count - 1, 1)
        if t <= 0.5:
            local = t / 0.5
            center = entry.lerp(axis, local)
        else:
            local = (t - 0.5) / 0.5
            center = axis.lerp(exit_point, local)
        distal_weight = smoothstep(t)
        surface_lift = proximal_surface_lift * (1.0 - t) + distal_surface_lift * t
        samples.append({
            "center": center,
            "radius": radius,
            "surface_lift": surface_lift,
            "weights": {
                proximal_name: 1.0 - distal_weight,
                joint["bone"]: distal_weight,
            },
        })

    return samples, {
        "finger": joint["finger"],
        "bone": joint["bone"],
        "proximal_bone": proximal_name,
        "joint_type": joint["jointType"],
        "joint_axis": axis,
        "entry_point": entry,
        "entry_segment": entry_segment,
        "entry_u": entry_u,
        "exit_point": exit_point,
        "exit_segment": rig_chain.index(joint["bone"]),
        "exit_u": exit_u,
        "surface_lift": (proximal_surface_lift + distal_surface_lift) * 0.5,
        "entry_surface_lift": proximal_surface_lift,
        "exit_surface_lift": distal_surface_lift,
        "pad_length": (exit_point - axis).length + (axis - entry).length,
    }


for joint in JOINTS:
    finger = joint["finger"]
    pad_width = {
        "Thumb": 0.245,
        "Index": 0.238,
        "Middle": 0.246,
        "Ring": 0.232,
        "Little": 0.202,
    }[finger]
    requested_length = PAD_LENGTHS[joint["jointType"]] * (0.92 if finger == "Little" else 1.0)
    samples, layout = joint_sensor_samples(joint, requested_length)
    sensor = create_ribbon(
        f"Sensor_{joint['id']}",
        samples,
        pad_width,
        0.038,
        MAT_COPPER,
    )
    sensor["hsadId"] = joint["id"]
    sensor["hsadJointId"] = joint["id"]
    sensor["anatomicalName"] = joint["anatomicalName"]
    sensor["anatomicalNodeName"] = joint["anatomicalNode"]
    sensor["finger"] = finger
    sensor["jointType"] = joint["jointType"]
    sensor["boneName"] = joint["bone"]
    sensor["proximalBoneName"] = joint["proximalBone"]
    sensor["channel"] = joint["channel"]
    sensor["rawChannels"] = ",".join(str(v) for v in joint["raw"])
    sensor["differential"] = joint["diff"]
    sensor["partId"] = "sensor"
    sensor["hsadPartId"] = "sensor"
    sensor_nodes.append(sensor)

    anchor_location = layout["joint_axis"] + Vector((0, 0, layout["surface_lift"] + 0.03))
    highlight = bpy.data.objects.new(f"Highlight_{joint['id']}", None)
    bpy.context.scene.collection.objects.link(highlight)
    highlight.location = anchor_location
    highlight["hsadId"] = joint["id"]
    highlight["hsadJointId"] = joint["id"]
    highlight["role"] = "highlight-anchor"
    parent_to_bone(highlight, joint["bone"])

    anatomical_anchor = bpy.data.objects.new(joint["anatomicalNode"], None)
    bpy.context.scene.collection.objects.link(anatomical_anchor)
    anatomical_anchor.location = anchor_location
    anatomical_anchor["hsadId"] = joint["id"]
    anatomical_anchor["hsadJointId"] = joint["id"]
    anatomical_anchor["role"] = "anatomical-sensor-anchor"
    parent_to_bone(anatomical_anchor, joint["bone"])

    layout["pad_width"] = pad_width
    sensor_layout[joint["id"]] = layout


RIG_CHAINS = {
    "Thumb": ["Thumb_CMC", "Thumb_MCP", "Thumb_IP"],
    "Index": finger_specs["Index"][0],
    "Middle": finger_specs["Middle"][0],
    "Ring": finger_specs["Ring"][0],
    "Little": finger_specs["Little"][0],
}
RIG_RADII = {
    "Thumb": [0.47, 0.37, 0.31, 0.245],
    "Index": finger_specs["Index"][1],
    "Middle": finger_specs["Middle"][1],
    "Ring": finger_specs["Ring"][1],
    "Little": finger_specs["Little"][1],
}


def span_samples(finger: str, segment: int, start_u: float, end_u: float, count: int) -> list[dict]:
    chain = RIG_CHAINS[finger]
    radii = RIG_RADII[finger]
    bone = arm_data.bones[chain[segment]]
    samples: list[dict] = []
    for step in range(count):
        t = step / max(count - 1, 1)
        u = start_u + (end_u - start_u) * t
        radius = radii[segment] * (1 - u) + radii[segment + 1] * u
        root_name = "WristRoot" if finger != "Thumb" or segment == 0 else "Thumb_CMC"
        samples.append({
            "center": bone.head_local.lerp(bone.tail_local, u),
            "radius": radius,
            "segment": segment,
            "u": u,
            "surface_lift": radius * 0.85 + 0.058,
            "weights": sample_weights(chain, segment, u, root_name),
        })
    return samples


def append_without_duplicate(target: list[dict], incoming: list[dict]) -> None:
    if not incoming:
        return
    if target and (target[-1]["center"] - incoming[0]["center"]).length < 1e-6:
        target.extend(incoming[1:])
    else:
        target.extend(incoming)


for finger, ids in CHAIN_IDS.items():
    previous_layout = None
    chain = RIG_CHAINS[finger]
    radii = RIG_RADII[finger]
    for route_index, joint_id in enumerate(ids):
        layout = sensor_layout[joint_id]
        trace_samples: list[dict] = []

        if previous_layout is None:
            if finger == "Thumb":
                append_without_duplicate(
                    trace_samples,
                    span_samples(finger, 0, 0.0, min(0.98, layout["entry_u"] + 0.045), 22),
                )
            else:
                start = Vector((finger_x[finger], 0.55, 0))
                end = layout["entry_point"].lerp(layout["joint_axis"], 0.14)
                for step in range(18):
                    t = step / 17
                    eased = smoothstep(t)
                    trace_samples.append({
                        "center": start.lerp(end, eased),
                        "radius": bone_radii[layout["bone"]],
                        "surface_lift": (1.0 - eased) * 0.535 + eased * layout["entry_surface_lift"],
                        "weights": {"WristRoot": 1.0 - eased, layout["bone"]: eased},
                    })
            connects_from = "MainFPC"
        else:
            # The preceding pad exits onto the same phalanx from which the next
            # pad enters. The serpentine therefore occupies only the flexible
            # gap and never crosses through a rectangular PVDF pad.
            shared_segment = previous_layout["exit_segment"]
            if shared_segment != layout["entry_segment"]:
                raise RuntimeError(f"Non-contiguous FPC route {ids[route_index - 1]} -> {joint_id}")
            append_without_duplicate(
                trace_samples,
                span_samples(
                    finger,
                    shared_segment,
                    max(0.0, previous_layout["exit_u"] - 0.045),
                    min(1.0, layout["entry_u"] + 0.045),
                    22,
                ),
            )
            connects_from = f"Sensor_{ids[route_index - 1]}"

        turns = max(3, round(sum(
            (trace_samples[index]["center"] - trace_samples[index - 1]["center"]).length
            for index in range(1, len(trace_samples))
        ) / 0.18))
        amplitude = min(0.105, layout["pad_width"] * 0.30)
        lateral_offsets = []
        for index in range(len(trace_samples)):
            t = index / max(len(trace_samples) - 1, 1)
            envelope = math.sin(math.pi * t) ** 0.62
            lateral_offsets.append(math.sin(t * math.tau * turns) * amplitude * envelope)

        serpentine = create_ribbon(
            f"Serpentine_{joint_id}",
            trace_samples,
            0.058,
            0.026,
            MAT_TRACE,
            lateral_offsets,
        )
        serpentine["hsadId"] = joint_id
        serpentine["hsadJointId"] = joint_id
        serpentine["partId"] = "serpentine"
        serpentine["hsadPartId"] = "serpentine"
        serpentine["connectsFrom"] = connects_from
        serpentine["connectsTo"] = f"Sensor_{joint_id}"
        serpentine["continuityGroup"] = f"FPC_{finger}"
        serpentine_nodes.append(serpentine)
        previous_layout = layout


# Add model metadata used by runtime validation and documentation.
metadata = bpy.data.objects.new("HSAD_Metadata", None)
bpy.context.scene.collection.objects.link(metadata)
metadata["modelVersion"] = "3.0-joint-axis-corrected"
metadata["sampleRateHz"] = 80
metadata["sensorCount"] = 14
metadata["rawChannelCount"] = 28
metadata["sourceBoundary"] = "geometry simplified from audited thesis, EDA and supplied model assets"


# Neutral rest pose and export.
armature.data.pose_position = "POSE"
for pose_bone in armature.pose.bones:
    pose_bone.rotation_mode = "QUATERNION"
    pose_bone.rotation_quaternion = (1, 0, 0, 0)

bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

for obj in bpy.context.scene.objects:
    obj.select_set(obj.type in {"ARMATURE", "MESH", "EMPTY"})

export_kwargs = dict(
    filepath=str(output_glb),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_animations=False,
    export_skins=True,
    export_morph=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_extras=True,
    export_cameras=False,
    export_lights=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
bpy.ops.export_scene.gltf(**export_kwargs)


# Deterministic preview render; preview-only objects are added after saving and
# exporting so they do not pollute the source Blend or GLB.
world = bpy.context.scene.world or bpy.data.worlds.new("PreviewWorld")
bpy.context.scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
if background:
    background.inputs["Color"].default_value = (0.035, 0.045, 0.052, 1)
    background.inputs["Strength"].default_value = 0.42

def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.camera_add(location=(7.7, -8.8, 10.6))
camera = bpy.context.object
camera.name = "PreviewCamera"
camera.data.lens = 62
look_at(camera, Vector((0, 0.75, 0)))
bpy.context.scene.camera = camera

for name, location, energy, size, color in (
    ("Key", (4.5, -2.5, 9.5), 1150, 5.2, (1.0, 0.88, 0.72)),
    ("Fill", (-5.0, 0.5, 6.0), 850, 4.2, (0.65, 0.88, 1.0)),
    ("Rim", (1.0, 7.0, 5.5), 900, 3.5, (0.55, 0.9, 1.0)),
):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = f"Preview{name}"
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    look_at(light, Vector((0, 0.6, 0)))

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0.6, -0.72))
ground = bpy.context.object
ground.name = "PreviewGround"
ground.data.materials.append(make_material("PreviewGroundMaterial", (0.12, 0.15, 0.16, 1), 0.78))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1400
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(preview_path)
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.ops.render.render(write_still=True)


mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and not obj.name.startswith("Preview")]
triangle_total = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in mesh_objects)
vertex_total = sum(len(obj.data.vertices) for obj in mesh_objects)
report = {
    "blender_version": bpy.app.version_string,
    "reference_blend": source_audit,
    "working_reference": working_audit,
    "reference_fbx": {
        "path": str(reference_fbx) if reference_fbx else None,
        "bytes": reference_fbx.stat().st_size if reference_fbx and reference_fbx.exists() else None,
        "sha256": sha256(reference_fbx),
        "usage": "shape/component placement reference only; dense unrigged mesh is not embedded in web output",
    },
    "glove_reference_fbx": {
        "path": str(glove_reference_fbx) if glove_reference_fbx else None,
        "bytes": glove_reference_fbx.stat().st_size if glove_reference_fbx and glove_reference_fbx.exists() else None,
        "sha256": sha256(glove_reference_fbx),
        "usage": "natural open-hand silhouette and worn-device relationship reference; not embedded in web output",
    },
    "output_blend": str(output_blend),
    "output_glb": str(output_glb),
    "glb_bytes": output_glb.stat().st_size,
    "triangles": triangle_total,
    "vertices": vertex_total,
    "bones": [bone.name for bone in arm_data.bones],
    "bone_count": len(arm_data.bones),
    "joint_bones": [joint["bone"] for joint in JOINTS],
    "sensor_nodes": [obj.name for obj in sensor_nodes],
    "highlight_nodes": [f"Highlight_{joint['id']}" for joint in JOINTS],
    "serpentine_nodes": [obj.name for obj in serpentine_nodes],
    "fpc_continuity": {
        finger: ["MainFPC", *sum(([f"Serpentine_{joint_id}", f"Sensor_{joint_id}"] for joint_id in ids), [])]
        for finger, ids in CHAIN_IDS.items()
    },
    "sensor_alignment": {
        joint_id: {
            "bone": layout["bone"],
            "pad_length": round(layout["pad_length"], 6),
            "pad_width": round(layout["pad_width"], 6),
            "long_axis": "local-Y tracks bone head-to-tail",
        }
        for joint_id, layout in sensor_layout.items()
    },
    "part_nodes": [
        "DeviceRoot", "MainFPC", "CircuitModule", "SignalConditioning", "AnalogMultiplexerArray",
        "ESP32Module", "IMUModule", "BatteryModule", "PowerManagement", "TypeCPort",
        "FingerFPC_ThumbBase", "FingerFPC_Thumb", "FingerFPC_Index", "FingerFPC_Middle", "FingerFPC_Ring", "FingerFPC_Little",
    ],
    "joint_mapping": JOINTS,
    "source_hashes": {
        "blend": sha256(reference_blend),
        "working_blend": sha256(working_reference),
    },
    "preview": str(preview_path),
}
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"HSAD_TEACHING_GLB={output_glb}")
print(f"HSAD_TEACHING_BLEND={output_blend}")
print(f"HSAD_TEACHING_TRIANGLES={triangle_total}")
print(f"HSAD_TEACHING_GLB_BYTES={output_glb.stat().st_size}")
print(f"HSAD_TEACHING_BONES={len(arm_data.bones)}")
