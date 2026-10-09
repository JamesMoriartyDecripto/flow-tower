#!/usr/bin/env python3
"""Quick runway math. Usage: python scripts/simple_calculation.py <total_runway> <monthly_burn>"""
import json
import sys

total, burn = float(sys.argv[1]), float(sys.argv[2])
print(json.dumps({
    "monthly_burn": burn,
    "runway_months": round(total / burn, 1),
    "total_runway_dollars": total,
    "quarterly_burn": burn * 3,
    "burn_rate_daily": round(burn / 30, 2),
}, indent=2))
