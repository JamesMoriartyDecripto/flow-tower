#!/usr/bin/env python3
"""12-month cash forecast from financial_data/. Usage: python scripts/financial_forecast.py [growth]"""
import csv
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "financial_data"

growth = float(sys.argv[1]) if len(sys.argv) > 1 else None
forecast = json.loads((DATA / "revenue_forecast.json").read_text())
with open(DATA / "burn_rate.csv") as f:
    burn_rows = list(csv.DictReader(f))

cash = forecast["cash_on_hand"]
mrr = forecast["current_mrr"]
growth = growth if growth is not None else forecast["mom_growth"]
burn = float(burn_rows[-1]["gross_burn"])

months = []
for m in range(1, 13):
    mrr *= 1 + growth
    net = burn - mrr
    cash -= net
    months.append({"month": m, "mrr": round(mrr), "net_burn": round(net), "cash": round(cash)})
    if cash <= 0:
        break

breakeven = next((x["month"] for x in months if x["net_burn"] <= 0), None)
print(json.dumps({"growth": growth, "breakeven_month": breakeven,
                  "cash_month_12": months[-1]["cash"], "months": months}, indent=2))
