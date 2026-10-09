#!/usr/bin/env python3
"""Weighted decision matrix. Usage: python scripts/decision_matrix.py options.json
options.json: {"criteria": {"runway": 0.4, ...}, "options": {"A": {"runway": 7, ...}, ...}}"""
import json
import sys

spec = json.load(open(sys.argv[1]))
weights = spec["criteria"]
total_w = sum(weights.values())

scores = {
    name: round(sum(weights[c] * vals.get(c, 0) for c in weights) / total_w, 2)
    for name, vals in spec["options"].items()
}
ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
margin = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else None
print(json.dumps({
    "ranking": ranked,
    "winner": ranked[0][0],
    "margin": margin,
    "close_call": margin is not None and margin < 0.5,  # escalate close calls to the CEO
}, indent=2))
