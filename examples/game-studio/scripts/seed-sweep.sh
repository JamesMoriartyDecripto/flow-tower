#!/usr/bin/env bash
# Runs the deterministic worldgen stages for a list of seeds and prints the reachability verdict.
set -euo pipefail

OUT="${OUT:-build/worldgen}"
SEEDS=("${@:-4127 9001 1337 2718 31415}")

for seed in ${SEEDS[@]}; do
  dir="$OUT/$seed"
  mkdir -p "$dir"
  python3 pipelines/worldgen/biome_graph.py --seed "$seed" --out "$dir/graph.json"
  python3 pipelines/worldgen/terrain_heightmap.py --graph "$dir/graph.json" --out "$dir/heightmaps"
  python3 pipelines/worldgen/poi_placement.py --graph "$dir/graph.json" --heightmaps "$dir/heightmaps" --out "$dir/layout.json"
  if python3 pipelines/worldgen/navmesh_check.py --layout "$dir/layout.json" --heightmaps "$dir/heightmaps"; then
    echo "seed=$seed PASS"
  else
    echo "seed=$seed FAIL" | tee -a logs/worldgen.log
  fi
done
