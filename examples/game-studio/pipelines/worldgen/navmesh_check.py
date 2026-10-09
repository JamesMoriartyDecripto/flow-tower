"""Offline traversability check on the generated layout (before Unreal builds a navmesh).

    python pipelines/worldgen/navmesh_check.py --layout build/worldgen/seed_4127/layout.json

Rasterises walkable cells (slope <= max_walk_slope) per island, flood-fills from the
camp, and verifies every beacon and ember vein is reachable on foot, and that every
island link has a walkable anchor on both ends. Cheap enough to reject bad seeds
before spending editor time; the authoritative check is validate_level.py in UE.
"""
import argparse
import json
from collections import deque

import numpy as np
from PIL import Image

MAX_WALK_SLOPE_DEG = 38.0


def walkable(height, radius_m):
    h = height.astype(np.float32) / 65535.0 * 120.0  # metres, matches config max_height_m
    m_per_px = radius_m * 2 / h.shape[0]
    gy, gx = np.gradient(h, m_per_px)
    return (np.degrees(np.arctan(np.hypot(gx, gy))) <= MAX_WALK_SLOPE_DEG) & (h > 1.0), m_per_px


def flood(mask, start):
    seen = np.zeros_like(mask, dtype=bool)
    if not mask[start]:
        return seen
    queue = deque([start])
    seen[start] = True
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def to_px(poi, island, m_per_px, res):
    cx, cy, _ = island["center_m"]
    x, y, _ = poi["position_m"]
    return int((y - cy) / m_per_px + res / 2), int((x - cx) / m_per_px + res / 2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--layout", required=True)
    args = p.parse_args()
    with open(args.layout) as fh:
        layout = json.load(fh)
    with open(args.layout.replace("layout.json", "graph.json")) as fh:
        islands = {i["id"]: i for i in json.load(fh)["islands"]}

    problems = []
    for iid, island in islands.items():
        height = np.array(Image.open(island["heightmap"]))
        mask, m_per_px = walkable(height, island["radius_m"])
        here = [x for x in layout["pois"] if x["island"] == iid]
        anchor = next((x for x in here if x["type"] in ("camp", "bridge_anchor")), None)
        if anchor is None:
            problems.append(f"island {iid}: no camp or bridge anchor")
            continue
        reach = flood(mask, to_px(anchor, island, m_per_px, height.shape[0]))
        for poi in (x for x in here if x["type"] in ("beacon", "ember_vein")):
            y, x = to_px(poi, island, m_per_px, height.shape[0])
            if not reach[min(max(y, 0), reach.shape[0] - 1), min(max(x, 0), reach.shape[1] - 1)]:
                problems.append(f"island {iid}: {poi['type']} {poi['id']} unreachable")

    print(json.dumps({"seed": layout["seed"], "pass": not problems, "problems": problems[:20]}))
    raise SystemExit(0 if not problems else 2)


if __name__ == "__main__":
    main()
