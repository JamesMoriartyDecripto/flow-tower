"""Daily pacing check: month-to-date spend vs plan per campaign and against the monthly cap.

Usage: python scripts/pacing_check.py ledger.csv plans/budget-plan-2026-q4.yaml 2026-10-08
ledger.csv columns: date,platform,campaign_id,spend_eur (one row per campaign per day).
Prints JSON flags for the paid optimizer; exit code 2 when the monthly cap would be breached.
"""
import calendar
import csv
import json
import sys
from collections import defaultdict
from datetime import date, timedelta

import yaml

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def weights_until(day: date, weekday_weight: dict) -> tuple[float, float]:
    """Weighted share of the month elapsed (B2B traffic is low at weekends)."""
    first = day.replace(day=1)
    last = calendar.monthrange(day.year, day.month)[1]
    total = elapsed = 0.0
    for i in range(last):
        d = first + timedelta(days=i)
        w = weekday_weight[DAYS[d.weekday()]]
        total += w
        if d <= day:
            elapsed += w
    return elapsed, total


def main(ledger_path: str, plan_path: str, as_of: str) -> int:
    day = date.fromisoformat(as_of)
    plan = yaml.safe_load(open(plan_path))
    tol = plan["pacing"]["tolerance_pct"] / 100
    elapsed, total = weights_until(day, plan["pacing"]["weekday_weight"])
    share = elapsed / total

    mtd = defaultdict(float)
    with open(ledger_path) as f:
        for row in csv.DictReader(f):
            d = date.fromisoformat(row["date"])
            if d.year == day.year and d.month == day.month and d <= day:
                mtd[row["campaign_id"]] += float(row["spend_eur"])

    flags, total_mtd = [], sum(mtd.values())
    for platform, ch in plan["channels"].items():
        for c in ch["campaigns"]:
            monthly = c["daily"] * 30.4  # Google's monthly charging limit; used for all platforms
            expected = monthly * share
            actual = mtd.get(c["id"], 0.0)
            ratio = actual / expected if expected else 0.0
            if abs(ratio - 1) > tol:
                flags.append({
                    "platform": platform, "campaign": c["id"],
                    "expected_mtd": round(expected), "actual_mtd": round(actual),
                    "pacing": round(ratio, 2),
                    "direction": "over" if ratio > 1 else "under",
                })

    projected = total_mtd / share if share else 0.0
    cap = plan["monthly_cap"]
    out = {
        "as_of": as_of, "month_share": round(share, 3), "spend_mtd": round(total_mtd),
        "projected_month": round(projected), "cap": cap,
        "cap_breach_projected": projected > cap, "flags": flags,
    }
    print(json.dumps(out, indent=2))
    return 2 if projected > cap else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
