"""Export a finished asset to FBX (Unreal) and glTF (web previews / store page).

Usage:
    blender -b keeper.blend -P pipelines/blender/export_asset.py -- \
        --root SK_Keeper --name SK_Keeper --out exports/characters --formats fbx gltf

Applies UE conventions: centimetre scale, +X forward, no leaf bones, tangent space
exported, smoothing groups by face. Writes a sidecar <name>.manifest.json that
import_assets.py (Unreal) and register_asset (forge MCP) both read.
"""
import argparse
import json
import os
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Forge Studio exporter")
    p.add_argument("--root", required=True, help="Root object (armature, mesh or LOD group)")
    p.add_argument("--name", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--formats", nargs="+", choices=["fbx", "gltf"], default=["fbx"])
    p.add_argument("--asset-class", default="prop")
    return p.parse_args(argv)


def select_hierarchy(root):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *root.children_recursive]:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root


def export_fbx(path, has_armature):
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS",
        axis_forward="X", axis_up="Z", mesh_smooth_type="FACE", use_tspace=True,
        add_leaf_bones=False, bake_anim=has_armature, object_types={"ARMATURE", "MESH", "EMPTY"},
    )


def export_gltf(path):
    bpy.ops.export_scene.gltf(
        filepath=path, use_selection=True, export_format="GLB",
        export_image_format="WEBP", export_draco_mesh_compression_enable=True,
    )


def main():
    args = parse_args()
    root = bpy.data.objects[args.root]
    os.makedirs(bpy.path.abspath(args.out), exist_ok=True)
    select_hierarchy(root)
    meshes = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    has_armature = root.type == "ARMATURE"

    files = []
    if "fbx" in args.formats:
        path = os.path.join(bpy.path.abspath(args.out), f"{args.name}.fbx")
        export_fbx(path, has_armature)
        files.append(path)
    if "gltf" in args.formats:
        path = os.path.join(bpy.path.abspath(args.out), f"{args.name}.glb")
        export_gltf(path)
        files.append(path)

    manifest = {
        "name": args.name,
        "asset_class": args.asset_class,
        "files": [os.path.basename(f) for f in files],
        "lods": sorted(o.name for o in meshes if "_LOD" in o.name),
        "tris_lod0": sum(len(p.vertices) - 2 for o in meshes if o.name.endswith(("_LOD0", "_LP")) for p in o.data.polygons),
        "materials": sorted({s.material.name for o in meshes for s in o.material_slots if s.material}),
        "bones": len(root.data.bones) if has_armature else 0,
        "source_blend": bpy.data.filepath,
    }
    with open(os.path.join(bpy.path.abspath(args.out), f"{args.name}.manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    print(f"EXPORT ok name={args.name} files={len(files)} tris={manifest['tris_lod0']}")


if __name__ == "__main__":
    main()
