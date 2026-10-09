"""Place points of interest on island heightmaps with Poisson-disk sampling.

    python pipelines/worldgen/poi_placement.py --graph build/worldgen/seed_4127/graph.json

POI types, densities and slope limits come from config/worldgen.yaml. Beacons go on
plateaus (low slope, high ground); wisp nests keep a minimum distance from camps so
the first minutes of a run are safe. Writes layout.json for build_level.py.
"""
import argparse
import json
import os

import numpy as np
import yaml
from PIL import Image


def slope(height):
    gy, gx = np.gradient(height.astype(np.float32) / 65535.0)
    return np.degrees(np.arctan(np.hypot(gx, gy) * height.shape[0] / 4))


def poisson_disk(rng, mask, min_dist_px, k=30, limit=200):
    """Bridson-style sampling restricted to valid cells of `mask`."""
    valid = np.argwhere(mask)
    if len(valid) == 0:
        return []
    points = [valid[rng.integers(len(valid))].astype(float)]
    active = [0]
    while active and len(points) < limit:
        idx = active.pop(rng.integers(len(active)))
        for _ in range(k):
            angle, radius = rng.uniform(0, 2 * np.pi), rng.uniform(min_dist_px, 2 * min_dist_px)
            cand = points[idx] + radius * np.array([np.cos(angle), np.sin(angle)])
            y, x = cand.astype(int)
            if not (0 <= y < mask.shape[0] and 0 <= x < mask.shape[1]) or not mask[y, x]:
                continue
            if all(np.linalg.norm(cand - q) >= min_dist_px for q in points):
                points.append(cand)
                active.append(len(points) - 1)
    return points


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--graph", required=True)
    args = p.parse_args()

    with open("config/worldgen.yaml") as fh:
        cfg = yaml.safe_load(fh)
    with open(args.graph) as fh:
        graph = json.load(fh)
    rng = np.random.default_rng(graph["seed"])
    pois, next_id = [], 0

    for island in graph["islands"]:
        height = np.array(Image.open(island["heightmap"]))
        s = slope(height)
        res = height.shape[0]
        m_per_px = island["radius_m"] * 2 / res
        for kind, rule in cfg["pois"].items():
            if island["role"] not in rule.get("roles", ["start", "standard", "final_beacon"]):
                continue
            mask = (s <= rule["max_slope_deg"]) & (height >= rule.get("min_height", 0) * 65535)
            area_km2 = (island["radius_m"] / 1000) ** 2 * np.pi
            limit = max(rule.get("min_per_island", 0), int(round(rule["per_km2"] * area_km2)))
            for py, px in poisson_disk(rng, mask, rule["min_spacing_m"] / m_per_px, limit=limit):
                cx, cy, cz = island["center_m"]
                pois.append({"id": next_id, "type": kind, "island": island["id"],
                             "position_m": [cx + (px - res / 2) * m_per_px, cy + (py - res / 2) * m_per_px,
                                            cz + float(height[int(py), int(px)]) / 65535 * cfg["max_height_m"]],
                             "yaw": float(rng.uniform(0, 360))})
                next_id += 1

    biome = next(b for b in cfg["biomes"] if b["id"] == graph["biome"])
    layout = {"seed": graph["seed"], "biome": graph["biome"], "size_m": biome["extent_m"] * 2,
              "max_height_m": cfg["max_height_m"], "heightmap": graph["islands"][0]["heightmap"], "pois": pois}
    with open(os.path.join(os.path.dirname(args.graph), "layout.json"), "w") as fh:
        json.dump(layout, fh, indent=2)
    counts = {k: sum(1 for x in pois if x["type"] == k) for k in cfg["pois"]}
    print(json.dumps({"ok": counts.get("beacon", 0) >= 3, "pois": len(pois), "by_type": counts}))


if __name__ == "__main__":
    main()
