"""Automatic retopology for sculpted / generated meshes.

Usage:
    blender -b keeper_sculpt.blend -P pipelines/blender/retopo.py -- \
        --object Keeper_HP --target-tris 18000 --out Keeper_LP

Strategy: voxel remesh to clean topology, then planar + collapse decimation down to
the triangle budget from config/asset-budgets.yaml. The high-poly source is kept
(hidden) so bake_pbr.py can bake normals from it.
"""
import argparse
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Forge Studio retopology")
    p.add_argument("--object", required=True, help="High-poly source object name")
    p.add_argument("--target-tris", type=int, required=True)
    p.add_argument("--out", required=True, help="Name of the low-poly object to create")
    p.add_argument("--voxel-size", type=float, default=0.01, help="Remesh voxel size in metres")
    p.add_argument("--keep-sharp", action="store_true", help="Preserve sharp edges (hard-surface props)")
    return p.parse_args(argv)


def tri_count(obj) -> int:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    tris = sum(len(poly.vertices) - 2 for poly in mesh.polygons)
    obj.evaluated_get(depsgraph).to_mesh_clear()
    return tris


def duplicate(src, name):
    low = src.copy()
    low.data = src.data.copy()
    low.name = low.data.name = name
    bpy.context.collection.objects.link(low)
    return low


def apply_modifier(obj, mod):
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def main():
    args = parse_args()
    src = bpy.data.objects[args.object]
    low = duplicate(src, args.out)

    remesh = low.modifiers.new("Remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = args.voxel_size
    remesh.use_smooth_shade = not args.keep_sharp
    apply_modifier(low, remesh)

    if args.keep_sharp:
        planar = low.modifiers.new("Planar", "DECIMATE")
        planar.decimate_type = "DISSOLVE"
        planar.angle_limit = 0.0873  # 5 degrees
        apply_modifier(low, planar)

    current = tri_count(low)
    if current > args.target_tris:
        collapse = low.modifiers.new("Collapse", "DECIMATE")
        collapse.decimate_type = "COLLAPSE"
        collapse.ratio = args.target_tris / current
        collapse.use_collapse_triangulate = True
        apply_modifier(low, collapse)

    weld = low.modifiers.new("Weld", "WELD")
    weld.merge_threshold = 0.0005
    apply_modifier(low, weld)

    src.hide_render = True
    src.hide_set(True)
    final = tri_count(low)
    status = "ok" if final <= args.target_tris else "over_budget"
    print(f"RETOPO {status} object={low.name} tris={final} target={args.target_tris}")
    bpy.ops.wm.save_mainfile()
    sys.exit(0 if status == "ok" else 2)


if __name__ == "__main__":
    main()
