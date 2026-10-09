#!/usr/bin/env python3
"""Candidate scoring. Usage: python scripts/talent_scorer.py candidates.json
Each candidate: {"name", "technical", "startup_fit", "team_fit", "ask", "band_max"} (scores 1-10)."""
import json
import sys

WEIGHTS = {"technical": 0.5, "startup_fit": 0.3, "team_fit": 0.2}

out = []
for c in json.load(open(sys.argv[1])):
    score = sum(c[k] * w for k, w in WEIGHTS.items())
    over_band = c["ask"] > c["band_max"]
    out.append({
        "name": c["name"],
        "score": round(score, 1),
        "within_band": not over_band,
        "verdict": "strong hire" if score >= 8 and not over_band
        else "hire" if score >= 7 else "no hire",
    })
print(json.dumps(sorted(out, key=lambda x: x["score"], reverse=True), indent=2))
