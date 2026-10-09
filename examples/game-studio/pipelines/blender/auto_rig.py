"""Generate a UE-compatible skeleton with Rigify and bind the mesh.

Usage:
    blender -b keeper.blend -P pipelines/blender/auto_rig.py -- \
        --mesh Keeper_LP --template human --max-bones 75

Builds a Rigify meta-rig, generates the control rig, keeps only DEF- bones for export
(renamed to the UE5 Manny naming so retargeting is trivial), and binds with
automatic weights. Fails if the deform bone count exceeds the budget.
"""
import argparse
import sys

import bpy

UE_NAMES = {
    "DEF-spine": "pelvis", "DEF-spine.001": "spine_01", "DEF-spine.002": "spine_02",
    "DEF-spine.003": "spine_03", "DEF-spine.004": "neck_01", "DEF-spine.006": "head",
    "DEF-upper_arm.L": "upperarm_l", "DEF-forearm.L": "lowerarm_l", "DEF-hand.L": "hand_l",
    "DEF-upper_arm.R": "upperarm_r", "DEF-forearm.R": "lowerarm_r", "DEF-hand.R": "hand_r",
    "DEF-thigh.L": "thigh_l", "DEF-shin.L": "calf_l", "DEF-foot.L": "foot_l",
    "DEF-thigh.R": "thigh_r", "DEF-shin.R": "calf_r", "DEF-foot.R": "foot_r",
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Forge Studio auto-rig")
    p.add_argument("--mesh", required=True)
    p.add_argument("--template", choices=["human", "quadruped", "wisp"], default="human")
    p.add_argument("--max-bones", type=int, default=75)
    return p.parse_args(argv)


def add_metarig(template, mesh):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object else None
    op = {"human": bpy.ops.object.armature_human_metarig_add,
          "quadruped": bpy.ops.object.armature_basic_quadruped_metarig_add,
          "wisp": bpy.ops.object.armature_basic_human_metarig_add}[template]
    op()
    meta = bpy.context.object
    height = mesh.dimensions.z
    meta.scale = (height / 1.8,) * 3  # Rigify meta-rig is authored for a 1.8 m human
    bpy.ops.object.transform_apply(scale=True)
    return meta


def main():
    args = parse_args()
    if "rigify" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="rigify")
    mesh = bpy.data.objects[args.mesh]

    meta = add_metarig(args.template, mesh)
    bpy.ops.pose.rigify_generate()
    rig = bpy.context.object
    rig.name = f"SK_{mesh.name.removesuffix('_LP')}"

    deform = [b for b in rig.data.bones if b.use_deform]
    for bone in deform:
        if bone.name in UE_NAMES:
            bone.name = UE_NAMES[bone.name]

    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    bpy.data.objects.remove(meta)

    unweighted = [v.index for v in mesh.data.vertices if not v.groups]
    status = "ok"
    if len(deform) > args.max_bones:
        status = "over_bone_budget"
    elif unweighted:
        status = "unweighted_vertices"
    print(f"RIG {status} rig={rig.name} deform_bones={len(deform)} max={args.max_bones} "
          f"unweighted={len(unweighted)}")
    bpy.ops.wm.save_mainfile()
    sys.exit(0 if status == "ok" else 2)


if __name__ == "__main__":
    main()
