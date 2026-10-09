"""Generate a 16-bit heightmap per island from the archipelago graph.

    python pipelines/worldgen/terrain_heightmap.py --graph build/worldgen/seed_4127/graph.json --res 1009

Fractal value noise (fBm) shaped by a radial falloff so islands have cliffs at the
rim and a plateau for beacons. Resolution 1009 matches a valid UE Landscape size
(63 quads x 16 sections + 1). Deterministic: per-island seed = run seed * 1000 + id.
"""
import argparse
import json
import os

import numpy as np


def value_noise(rng, res, cells):
    grid = rng.random((cells + 1, cells + 1))
    xs = np.linspace(0, cells, res, endpoint=False)
    x0 = xs.astype(int)
    t = xs - x0
    t = t * t * (3 - 2 * t)  # smoothstep
    top = grid[x0][:, x0] * (1 - t)[None, :] + grid[x0][:, x0 + 1] * t[None, :]
    bottom = grid[x0 + 1][:, x0] * (1 - t)[None, :] + grid[x0 + 1][:, x0 + 1] * t[None, :]
    return top * (1 - t)[:, None] + bottom * t[:, None]


def fbm(rng, res, octaves=5, base_cells=4, gain=0.5):
    total, amp, norm = np.zeros((res, res)), 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(rng, res, base_cells * 2 ** o)
        norm += amp
        amp *= gain
    return total / norm


def radial_falloff(res, plateau=0.35, rim=0.85):
    y, x = np.mgrid[-1:1:complex(res), -1:1:complex(res)]
    r = np.sqrt(x * x + y * y)
    return np.clip((rim - r) / (rim - plateau), 0, 1) ** 1.5


def island_heightmap(seed, island, res):
    rng = np.random.default_rng(seed)
    h = fbm(rng, res) * radial_falloff(res)
    plateau = radial_falloff(res, plateau=0.1, rim=0.25)
    h = np.maximum(h, plateau * h.max() * 0.8)  # flat-ish centre for the beacon
    if island["role"] == "final_beacon":
        h *= 1.3
    return (np.clip(h, 0, 1) * 65535).astype(np.uint16)


def write_png16(path, data):
    """Write a 16-bit grayscale PNG without extra deps (zlib + struct)."""
    import struct
    import zlib
    raw = b"".join(b"\x00" + row.byteswap().tobytes() for row in data)
    chunk = lambda tag, body: struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body))
    header = struct.pack(">IIBBBBB", data.shape[1], data.shape[0], 16, 0, 0, 0, 0)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--graph", required=True)
    p.add_argument("--res", type=int, default=1009)
    args = p.parse_args()

    with open(args.graph) as fh:
        graph = json.load(fh)
    out = os.path.join(os.path.dirname(args.graph), "heightmaps")
    os.makedirs(out, exist_ok=True)
    stats = []
    for island in graph["islands"]:
        hm = island_heightmap(graph["seed"] * 1000 + island["id"], island, args.res)
        path = os.path.join(out, f"island_{island['id']:02d}.png")
        write_png16(path, hm)
        island["heightmap"] = path
        stats.append(float((hm > 2000).mean()))
    with open(args.graph, "w") as fh:
        json.dump(graph, fh, indent=2)
    print(json.dumps({"ok": True, "islands": len(stats), "mean_land_ratio": round(float(np.mean(stats)), 3)}))


if __name__ == "__main__":
    main()
