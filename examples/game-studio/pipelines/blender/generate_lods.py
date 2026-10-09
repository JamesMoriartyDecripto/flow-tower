"""Generate LOD1..LODn from LOD0 using ratios from config/asset-budgets.yaml.

Usage:
    blender -b beacon.blend -P pipelines/blender/generate_lods.py -- \
        --object Beacon_LP --ratios 0.5 0.25 0.1

LODs are named <object>_LOD<n> and parented to an empty so the FBX/glTF exporter
writes them as a LOD group Unreal recognises on import.
"""
import argparse
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Forge Studio LOD generator")
    p.add_argument("--object", required=True)
    p.add_argument("--ratios", type=float, nargs="+", default=[0.5, 0.25, 0.1])
    p.add_argument("--min-tris", type=int, default=150, help="Never decimate below this")
    return p.parse_args(argv)


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def make_lod(src, index, ratio, min_tris):
    lod = src.copy()
    lod.data = src.data.copy()
    lod.name = lod.data.name = f"{src.name}_LOD{index}"
    bpy.context.collection.objects.link(lod)
    target = max(ratio, min_tris / max(tris(src), 1))
    mod = lod.modifiers.new("LOD", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = min(target, 1.0)
    mod.use_symmetry = True
    with bpy.context.temp_override(object=lod, active_object=lod):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return lod


def main():
    args = parse_args()
    src = bpy.data.objects[args.object]
    group = bpy.data.objects.new(f"{src.name}_LODGroup", None)
    group["fbx_type"] = "LodGroup"  # read by the FBX exporter custom-property path
    bpy.context.collection.objects.link(group)

    lod0 = src
    lod0.name = f"{src.name}_LOD0"
    lod0.parent = group
    rows = [(0, tris(lod0))]
    for i, ratio in enumerate(args.ratios, start=1):
        lod = make_lod(lod0, i, ratio, args.min_tris)
        lod.parent = group
        rows.append((i, tris(lod)))

    monotonic = all(a[1] > b[1] for a, b in zip(rows, rows[1:]))
    for index, count in rows:
        print(f"LOD{index} tris={count}")
    print(f"LODS {'ok' if monotonic else 'not_decreasing'} group={group.name} count={len(rows)}")
    bpy.ops.wm.save_mainfile()
    sys.exit(0 if monotonic else 2)


if __name__ == "__main__":
    main()
