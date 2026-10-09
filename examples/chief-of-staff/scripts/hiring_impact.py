#!/usr/bin/env python3
"""Hiring impact on burn and runway.
Usage: python scripts/hiring_impact.py <num_engineers> [salary]   (default salary 200000)"""
import json
import sys

CASH, BURN = 10_000_000, 500_000
LOADED = 1.3  # benefits, taxes, equipment

n = int(sys.argv[1])
salary = float(sys.argv[2]) if len(sys.argv) > 2 else 200_000
monthly_increase = n * salary * LOADED / 12
new_runway = CASH / (BURN + monthly_increase)
velocity = min(0.08 * n, 0.5)  # diminishing returns past ~6 hires

if new_runway >= 18:
    rec = "PROCEED: runway stays comfortable"
elif new_runway >= 12:
    rec = "PROCEED WITH CAUTION: stagger start dates"
else:
    rec = "DO NOT PROCEED: runway below 12-month floor"

print(json.dumps({
    "hires": n,
    "salary": salary,
    "monthly_burn_increase": round(monthly_increase),
    "current_runway_months": round(CASH / BURN, 1),
    "new_runway_months": round(new_runway, 1),
    "velocity_gain_pct": round(velocity * 100),
    "recommendation": rec,
}, indent=2))
