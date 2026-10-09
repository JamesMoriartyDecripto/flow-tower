"""UV unwrap + pack at a fixed texel density.

Usage:
    blender -b keeper.blend -P pipelines/blender/uv_unwrap.py -- \
        --object Keeper_LP --texel-density 512 --texture-size 2048

Texel density (px per metre) comes from config/style-guide.json so every asset in
Emberwake reads at the same sharpness. Adds a second UV channel for lightmaps.
"""
import argparse
import math
import sys

import bmesh
import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Forge Studio UV unwrap")
    p.add_argument("--object", required=True)
    p.add_argument("--texel-density", type=float, default=512.0, help="px per metre")
    p.add_argument("--texture-size", type=int, default=2048)
    p.add_argument("--margin", type=float, default=0.004)
    p.add_argument("--lightmap", action="store_true", default=True)
    return p.parse_args(argv)


def uv_area_and_world_area(obj, layer_name):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    uv = bm.loops.layers.uv[layer_name]
    uv_area = world_area = 0.0
    for face in bm.faces:
        world_area += face.calc_area()
        coords = [loop[uv].uv for loop in face.loops]
        uv_area += abs(sum(a.x * b.y - b.x * a.y for a, b in zip(coords, coords[1:] + coords[:1]))) / 2
    bm.free()
    return uv_area, world_area


def unwrap(obj, layer_name, margin):
    obj.data.uv_layers.active = obj.data.uv_layers[layer_name]
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def main():
    args = parse_args()
    obj = bpy.data.objects[args.object]
    if "UVMap" not in obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    unwrap(obj, "UVMap", args.margin)

    uv_area, world_area = uv_area_and_world_area(obj, "UVMap")
    achieved = math.sqrt(uv_area / max(world_area, 1e-6)) * args.texture_size
    deviation = abs(achieved - args.texel_density) / args.texel_density

    if args.lightmap:
        if "Lightmap" not in obj.data.uv_layers:
            obj.data.uv_layers.new(name="Lightmap")
        unwrap(obj, "Lightmap", args.margin * 2)
        obj.data.uv_layers.active = obj.data.uv_layers["UVMap"]

    status = "ok" if deviation <= 0.15 else "density_off"
    print(f"UV {status} object={obj.name} texel_density={achieved:.0f} target={args.texel_density:.0f} "
          f"deviation={deviation:.0%}")
    bpy.ops.wm.save_mainfile()
    sys.exit(0 if status == "ok" else 2)


if __name__ == "__main__":
    main()
