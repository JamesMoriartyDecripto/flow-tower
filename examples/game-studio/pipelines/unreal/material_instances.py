"""Create material instances from the Emberwake master material (editor Python).

    py pipelines/unreal/material_instances.py --asset /Game/Emberwake/Characters/SK_Keeper \
        --style config/style-guide.json

Every asset gets an MI of M_Ember_Master with its BC / N / ORM textures and the
style-guide scalar defaults (roughness bias, rim light, ember emissive), then the
MI is assigned to every material slot of the mesh.
"""
import argparse
import json

import unreal

MASTER = "/Game/Emberwake/Materials/M_Ember_Master"
MEL = unreal.MaterialEditingLibrary


def create_instance(name, folder):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    path = f"{folder}/{name}"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.load_asset(path)
    mi = tools.create_asset(name, folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, unreal.load_asset(MASTER))
    return mi


def bind_textures(mi, tex_folder, base):
    for param, suffix in (("BaseColor", "BC"), ("Normal", "N"), ("ORM", "ORM")):
        path = f"{tex_folder}/{base}_{suffix}"
        if unreal.EditorAssetLibrary.does_asset_exist(path):
            MEL.set_material_instance_texture_parameter_value(mi, param, unreal.load_asset(path))
        else:
            unreal.log_warning(f"missing texture {path}")


def apply_style(mi, style, asset_class):
    params = style["materials"]["defaults"] | style["materials"].get(asset_class, {})
    for name, value in params.items():
        if isinstance(value, list):
            MEL.set_material_instance_vector_parameter_value(mi, name, unreal.LinearColor(*value))
        else:
            MEL.set_material_instance_scalar_parameter_value(mi, name, float(value))


def assign(mesh, mi):
    if isinstance(mesh, unreal.SkeletalMesh):
        mats = mesh.get_editor_property("materials")
        for slot in mats:
            slot.set_editor_property("material_interface", mi)
        mesh.set_editor_property("materials", mats)
    else:
        for i in range(len(mesh.get_editor_property("static_materials"))):
            mesh.set_material(i, mi)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--asset", required=True, help="Folder of the imported asset")
    p.add_argument("--asset-class", default="prop")
    p.add_argument("--style", default="config/style-guide.json")
    args = p.parse_args()

    with open(args.style) as fh:
        style = json.load(fh)
    base = args.asset.rsplit("/", 1)[-1]
    mesh = unreal.load_asset(f"{args.asset}/{base}")
    mi = create_instance(f"MI_{base.split('_', 1)[-1]}", f"{args.asset}/Materials")
    bind_textures(mi, f"{args.asset}/Textures", base)
    apply_style(mi, style, args.asset_class)
    MEL.update_material_instance(mi)
    assign(mesh, mi)
    unreal.EditorAssetLibrary.save_loaded_assets([mi, mesh])
    print(json.dumps({"ok": True, "instance": mi.get_path_name(), "mesh": mesh.get_path_name()}))


if __name__ == "__main__":
    main()
