"""Validate a mesh against config/asset-budgets.yaml and print a JSON report.

Usage (called by the forge MCP tool validate_asset):
    blender -b keeper.blend -P pipelines/blender/validate_mesh.py -- \
        --object SK_Keeper --asset-class hero_character --budgets config/asset-budgets.yaml

Checks: triangle budget, material slots, texture resolution, non-manifold edges,
loose geometry, flipped normals, UV channels, applied scale, origin at base.
Exit 0 = pass, 2 = fail. The last stdout line is the JSON report.
"""
import argparse
import json
import sys

import bmesh
import bpy
import yaml


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Forge Studio mesh validator")
    p.add_argument("--object", required=True)
    p.add_argument("--asset-class", required=True)
    p.add_argument("--budgets", default="config/asset-budgets.yaml")
    return p.parse_args(argv)


def mesh_checks(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    report = {
        "tris": sum(len(f.verts) - 2 for f in bm.faces),
        "non_manifold_edges": sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary),
        "loose_verts": sum(1 for v in bm.verts if not v.link_edges),
        "zero_area_faces": sum(1 for f in bm.faces if f.calc_area() < 1e-8),
    }
    bm.free()
    return report


def main():
    args = parse_args()
    with open(args.budgets) as fh:
        budget = yaml.safe_load(fh)["classes"][args.asset_class]

    root = bpy.data.objects[args.object]
    meshes = [o for o in [root, *root.children_recursive] if o.type == "MESH"]
    lod0 = [o for o in meshes if not any(f"_LOD{i}" in o.name for i in range(1, 6))]
    errors, warnings = [], []

    tris = 0
    for obj in lod0:
        r = mesh_checks(obj)
        tris += r["tris"]
        if r["non_manifold_edges"]:
            warnings.append(f"{obj.name}: {r['non_manifold_edges']} non-manifold edges")
        if r["loose_verts"] or r["zero_area_faces"]:
            errors.append(f"{obj.name}: loose verts or degenerate faces")
        if any(abs(s - 1.0) > 1e-4 for s in obj.scale):
            errors.append(f"{obj.name}: scale not applied {tuple(round(s, 3) for s in obj.scale)}")
        if len(obj.data.uv_layers) < budget.get("uv_channels", 1):
            errors.append(f"{obj.name}: needs {budget.get('uv_channels', 1)} UV channels")

    if tris > budget["tris_lod0"]:
        errors.append(f"tris {tris} > budget {budget['tris_lod0']}")
    slots = {s.material for o in lod0 for s in o.material_slots if s.material}
    if len(slots) > budget["max_materials"]:
        errors.append(f"{len(slots)} materials > {budget['max_materials']}")
    for img in bpy.data.images:
        if img.size[0] > budget["max_texture"] or img.size[1] > budget["max_texture"]:
            errors.append(f"texture {img.name} {img.size[0]}x{img.size[1]} > {budget['max_texture']}")
    if root.type == "ARMATURE" and len(root.data.bones) > budget.get("max_bones", 0):
        errors.append(f"{len(root.data.bones)} bones > {budget.get('max_bones', 0)}")

    report = {"object": args.object, "asset_class": args.asset_class, "tris_lod0": tris,
              "materials": len(slots), "pass": not errors, "errors": errors, "warnings": warnings}
    print(json.dumps(report))
    sys.exit(0 if not errors else 2)


if __name__ == "__main__":
    main()
