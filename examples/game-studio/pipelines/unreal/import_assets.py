"""Import exported FBX assets into the Emberwake Unreal project (editor Python).

Run inside the editor (or via the unreal MCP server's run_python):
    py pipelines/unreal/import_assets.py --manifest exports/characters/SK_Keeper.manifest.json

Reads the sidecar manifest written by pipelines/blender/export_asset.py, imports with
the right options per asset class and returns the created asset paths as JSON.
"""
import argparse
import json
import os

import unreal

DEST = {
    "hero_character": "/Game/Emberwake/Characters",
    "enemy": "/Game/Emberwake/Enemies",
    "prop": "/Game/Emberwake/Props",
    "environment": "/Game/Emberwake/Environment",
    "weapon": "/Game/Emberwake/Weapons",
}


def build_options(manifest):
    options = unreal.FbxImportUI()
    skeletal = manifest["bones"] > 0
    options.import_mesh = True
    options.import_as_skeletal = skeletal
    options.import_materials = False  # material_instances.py builds MIs from the master material
    options.import_textures = False
    options.import_animations = skeletal
    options.mesh_type_to_import = unreal.FBXImportType.FBXIT_SKELETAL_MESH if skeletal else unreal.FBXImportType.FBXIT_STATIC_MESH
    if skeletal:
        options.skeletal_mesh_import_data.set_editor_property("import_morph_targets", True)
        options.skeletal_mesh_import_data.set_editor_property("normal_import_method",
                                                              unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS)
    else:
        data = options.static_mesh_import_data
        data.set_editor_property("combine_meshes", True)
        data.set_editor_property("generate_lightmap_u_vs", False)  # Lightmap UV authored in Blender
        data.set_editor_property("auto_generate_collision", True)
        options.set_editor_property("lod_number", len(manifest["lods"]))
    return options


def import_textures(folder, name, dest):
    tasks = []
    for suffix in ("BC", "N", "ORM"):
        path = os.path.join(folder, "textures", f"{name}_{suffix}.png")
        if not os.path.exists(path):
            continue
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", path)
        task.set_editor_property("destination_path", f"{dest}/Textures")
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", True)
        tasks.append(task)
    return tasks


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", required=True)
    args = p.parse_args()

    with open(args.manifest) as fh:
        manifest = json.load(fh)
    folder = os.path.dirname(args.manifest)
    dest = f"{DEST.get(manifest['asset_class'], '/Game/Emberwake/Misc')}/{manifest['name']}"

    mesh_task = unreal.AssetImportTask()
    mesh_task.set_editor_property("filename", os.path.join(folder, f"{manifest['name']}.fbx"))
    mesh_task.set_editor_property("destination_path", dest)
    mesh_task.set_editor_property("automated", True)
    mesh_task.set_editor_property("replace_existing", True)
    mesh_task.set_editor_property("save", True)
    mesh_task.set_editor_property("options", build_options(manifest))

    tasks = [mesh_task, *import_textures(folder, manifest["name"], dest)]
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)

    imported = [path for t in tasks for path in t.get_editor_property("imported_object_paths")]
    for path in imported:
        tex = unreal.load_asset(path)
        if isinstance(tex, unreal.Texture2D) and not path.endswith("_BC"):
            tex.set_editor_property("srgb", False)
            if path.endswith("_N"):
                tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                tex.set_editor_property("flip_green_channel", True)  # Blender OpenGL -> UE DirectX
            unreal.EditorAssetLibrary.save_asset(path)
    print(json.dumps({"ok": bool(imported), "destination": dest, "imported": imported}))


if __name__ == "__main__":
    main()
