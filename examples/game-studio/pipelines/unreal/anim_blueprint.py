"""Retarget UE5 Manny animations onto a new skeleton and create its Animation Blueprint.

    py pipelines/unreal/anim_blueprint.py --mesh /Game/Emberwake/Characters/SK_Keeper/SK_Keeper \
        --template /Game/Emberwake/Animation/ABP_Keeper_Template

The rig from auto_rig.py uses Manny bone names, so an IK Retargeter with default chain
mapping is enough. The new ABP is a child of a template ABP (locomotion state
machine + lantern-carry layer) so the animator only overrides sequences.
"""
import argparse
import json

import unreal

SOURCE_RIG = "/Game/Characters/Mannequins/Rigs/IK_Mannequin"
SOURCE_ANIMS = "/Game/Emberwake/Animation/Manny"
LOCOMOTION = ["Idle", "Walk_Fwd", "Jog_Fwd", "Jump_Start", "Jump_Loop", "Land", "Interact", "Lantern_Raise"]


def ensure_ik_rig(mesh, folder, name):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    ik_rig = tools.create_asset(f"IK_{name}", folder, unreal.IKRigDefinition, unreal.IKRigDefinitionFactory())
    ctrl = unreal.IKRigController.get_controller(ik_rig)
    ctrl.set_skeletal_mesh(mesh)
    ctrl.apply_auto_generated_retarget_definition()
    return ik_rig


def make_retargeter(target_rig, folder, name):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    rtg = tools.create_asset(f"RTG_Manny_To_{name}", folder, unreal.IKRetargeter, unreal.IKRetargetFactory())
    ctrl = unreal.IKRetargeterController.get_controller(rtg)
    ctrl.set_ik_rig(unreal.RetargetSourceOrTarget.SOURCE, unreal.load_asset(SOURCE_RIG))
    ctrl.set_ik_rig(unreal.RetargetSourceOrTarget.TARGET, target_rig)
    ctrl.auto_map_chains(unreal.AutoMapChainType.FUZZY, True)
    return rtg


def retarget(rtg, mesh, folder):
    sources = [unreal.AssetData(f"{SOURCE_ANIMS}/MM_{n}") for n in LOCOMOTION]
    source_mesh = unreal.load_asset("/Game/Characters/Mannequins/Meshes/SKM_Manny")
    return unreal.IKRetargetBatchOperation.duplicate_and_retarget(
        sources, source_mesh, mesh, rtg, search="MM_", replace="A_", prefix="", suffix="")


def make_child_abp(template, mesh, folder, name):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.AnimBlueprintFactory()
    factory.set_editor_property("target_skeleton", mesh.get_editor_property("skeleton"))
    factory.set_editor_property("parent_class", unreal.load_asset(template).generated_class())
    return tools.create_asset(f"ABP_{name}", folder, unreal.AnimBlueprint, factory)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mesh", required=True)
    p.add_argument("--template", required=True)
    args = p.parse_args()

    mesh = unreal.load_asset(args.mesh)
    folder = args.mesh.rsplit("/", 1)[0] + "/Animation"
    name = args.mesh.rsplit("/", 1)[-1].removeprefix("SK_")

    ik_rig = ensure_ik_rig(mesh, folder, name)
    rtg = make_retargeter(ik_rig, folder, name)
    anims = retarget(rtg, mesh, folder)
    abp = make_child_abp(args.template, mesh, folder, name)
    unreal.BlueprintEditorLibrary.compile_blueprint(abp)
    unreal.EditorAssetLibrary.save_directory(folder)
    print(json.dumps({"ok": True, "abp": abp.get_path_name(), "retargeted": [a.package_name for a in anims]}))


if __name__ == "__main__":
    main()
