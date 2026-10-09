"""Bake PBR maps from the high-poly source onto the low-poly game mesh (Cycles).

Usage:
    blender -b keeper.blend -P pipelines/blender/bake_pbr.py -- \
        --high Keeper_HP --low Keeper_LP --size 2048 --out //textures/keeper

Bakes Normal (OpenGL, converted to DirectX on UE import), AO, and the material's
BaseColor / Roughness / Metallic, then packs ORM (AO, Roughness, Metallic) into one
texture as Unreal expects.
"""
import argparse
import sys

import bpy
import numpy as np


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Forge Studio PBR bake")
    p.add_argument("--high", required=True)
    p.add_argument("--low", required=True)
    p.add_argument("--size", type=int, default=2048)
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--cage-extrusion", type=float, default=0.02)
    p.add_argument("--out", required=True, help="Output prefix, // = relative to .blend")
    return p.parse_args(argv)


def bake_target(low, name, size, colorspace):
    img = bpy.data.images.new(f"{low.name}_{name}", size, size, alpha=False, float_buffer=name == "N")
    img.colorspace_settings.name = colorspace
    for slot in low.material_slots:
        nodes = slot.material.node_tree.nodes
        node = nodes.get("BakeTarget") or nodes.new("ShaderNodeTexImage")
        node.name = "BakeTarget"
        node.image = img
        nodes.active = node
    return img


def bake(args, low, high, kind, name, colorspace, selected_to_active=True, pass_filter=None):
    img = bake_target(low, name, args.size, colorspace)
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(selected_to_active)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(
        type=kind,
        pass_filter=pass_filter or set(),
        use_selected_to_active=selected_to_active,
        cage_extrusion=args.cage_extrusion,
        margin=8,
    )
    return img


def save(img, path):
    img.filepath_raw = bpy.path.abspath(f"{path}.png")
    img.file_format = "PNG"
    img.save()


def pack_orm(ao, rough, metal, size, path):
    px = lambda img: np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    orm = np.ones((size, size, 4), dtype=np.float32)
    orm[..., 0], orm[..., 1], orm[..., 2] = px(ao)[..., 0], px(rough)[..., 0], px(metal)[..., 0]
    img = bpy.data.images.new("ORM", size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels[:] = orm.ravel()
    save(img, path)


def main():
    args = parse_args()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = args.samples
    scene.cycles.device = "GPU"
    high, low = bpy.data.objects[args.high], bpy.data.objects[args.low]

    normal = bake(args, low, high, "NORMAL", "N", "Non-Color")
    save(normal, f"{args.out}_N")
    ao = bake(args, low, high, "AO", "AO", "Non-Color")
    base = bake(args, low, high, "DIFFUSE", "BC", "sRGB", pass_filter={"COLOR"})
    save(base, f"{args.out}_BC")
    rough = bake(args, low, high, "ROUGHNESS", "R", "Non-Color", selected_to_active=False)
    metal = bake(args, low, high, "EMIT", "M", "Non-Color", selected_to_active=False)
    pack_orm(ao, rough, metal, args.size, f"{args.out}_ORM")
    print(f"BAKE ok low={low.name} size={args.size} maps=BC,N,ORM out={args.out}")


if __name__ == "__main__":
    main()
