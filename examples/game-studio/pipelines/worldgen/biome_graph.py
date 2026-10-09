"""Generate the archipelago graph for one run: islands as nodes, bridges/updrafts as edges.

    python pipelines/worldgen/biome_graph.py --seed 4127 --biome ashen_shoals --out build/worldgen/seed_4127

Deterministic for a given seed. Guarantees a connected graph (spanning tree first,
then extra edges for loops), a start island and a final beacon island at maximum
graph distance so a run always has a meaningful route.
"""
import argparse
import json
import os
from collections import deque

import numpy as np
import yaml


def load_biome(name):
    with open("config/worldgen.yaml") as fh:
        biomes = yaml.safe_load(fh)["biomes"]
    return next(b for b in biomes if b["id"] == name)


def place_islands(rng, count, extent_m, min_gap_m):
    points = []
    while len(points) < count:
        p = rng.uniform(-extent_m, extent_m, size=2)
        if all(np.linalg.norm(p - q) >= min_gap_m for q in points):
            points.append(p)
    return np.array(points)


def spanning_edges(points):
    """Prim's MST over euclidean distances: every island reachable, short bridges first."""
    n = len(points)
    dist = np.linalg.norm(points[:, None] - points[None, :], axis=-1)
    in_tree, edges = {0}, []
    while len(in_tree) < n:
        best = min(((i, j) for i in in_tree for j in range(n) if j not in in_tree), key=lambda e: dist[e])
        edges.append(best)
        in_tree.add(best[1])
    return edges, dist


def bfs_depths(n, edges, start):
    adj = {i: [] for i in range(n)}
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    depth, queue = {start: 0}, deque([start])
    while queue:
        node = queue.popleft()
        for nxt in adj[node]:
            if nxt not in depth:
                depth[nxt] = depth[node] + 1
                queue.append(nxt)
    return depth


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, required=True)
    p.add_argument("--biome", default="ashen_shoals")
    p.add_argument("--out", required=True)
    args = p.parse_args()

    biome = load_biome(args.biome)
    rng = np.random.default_rng(args.seed)
    count = int(rng.integers(biome["islands"]["min"], biome["islands"]["max"] + 1))
    points = place_islands(rng, count, biome["extent_m"], biome["islands"]["min_gap_m"])
    edges, dist = spanning_edges(points)

    extra = int(round(len(edges) * biome["loop_ratio"]))
    candidates = [(i, j) for i in range(count) for j in range(i + 1, count) if (i, j) not in edges and (j, i) not in edges]
    candidates.sort(key=lambda e: dist[e])
    edges += candidates[:extra]

    depth = bfs_depths(count, edges, 0)
    goal = max(depth, key=depth.get)
    islands = [{"id": i, "center_m": [float(x), float(y), float(rng.uniform(*biome["altitude_m"]))],
                "radius_m": float(rng.uniform(*biome["islands"]["radius_m"])), "depth": depth[i],
                "role": "start" if i == 0 else "final_beacon" if i == goal else "standard"} for i, (x, y) in enumerate(points)]

    os.makedirs(args.out, exist_ok=True)
    graph = {"seed": args.seed, "biome": args.biome, "islands": islands,
             "links": [{"a": a, "b": b, "kind": "bridge" if dist[a, b] < biome["bridge_max_m"] else "updraft"} for a, b in edges]}
    with open(os.path.join(args.out, "graph.json"), "w") as fh:
        json.dump(graph, fh, indent=2)
    print(json.dumps({"ok": True, "islands": count, "links": len(edges), "route_length": depth[goal]}))


if __name__ == "__main__":
    main()
