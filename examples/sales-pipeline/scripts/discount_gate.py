"""Discount gate: who must approve a quote, from pricing/discount-policy.yaml and pricing-rules.yaml.

Usage: python scripts/discount_gate.py quote.json pricing/discount-policy.yaml pricing/pricing-rules.yaml
quote.json: {"list_total": 41800, "net_total": 37600, "days": {"senior_consultant": 22, "consultant": 18},
             "fixed_price": true, "payment_terms_days": 30, "deposit_share": 0.3,
             "liability_cap_pct_fees": 100, "free_scope_eur": 0}
Output: {"approver": "account_executive" | "sales_director" | "ceo", "discount": 0.10, "margin": 0.41, "reasons": [...]}
"""
import json
import sys

import yaml

RANK = {"account_executive": 0, "sales_director": 1, "ceo": 2}


def gate(q: dict, policy: dict, pricing: dict) -> dict:
    discount = 1 - q["net_total"] / q["list_total"] if q["list_total"] else 0.0
    cost = sum(pricing["margin_floor"]["cost_per_day"][role] * d for role, d in q["days"].items())
    margin = 1 - cost / q["net_total"] if q["net_total"] else 0.0

    approver, reasons = "account_executive", []
    for band in policy["discount_bands"]:
        if discount <= band["max"] + 1e-9:
            approver = band["approver"]
            break

    def need(level: str, why: str) -> None:
        nonlocal approver
        reasons.append(why)
        if RANK[level] > RANK[approver]:
            approver = level

    if discount > 0.10:
        reasons.append(f"discount {discount:.1%}")
    if margin < pricing["margin_floor"]["gross_margin_min"]:
        need("ceo", f"margin {margin:.1%} below floor")
    if q.get("fixed_price") and q["net_total"] > 80000:
        need("ceo", "fixed price above 80,000 EUR")
    if q.get("liability_cap_pct_fees", 100) > 100:
        need("ceo", "liability cap above 100 % of fees")
    terms = q.get("payment_terms_days", 30)
    if terms > 60:
        need("ceo", f"payment terms {terms} days")
    elif terms > pricing["payment_schedule"]["terms_days_max_without_approval"]:
        need("sales_director", f"payment terms {terms} days")
    if q.get("fixed_price") and q.get("deposit_share", 0.3) < 0.3:
        need("sales_director", "deposit below 30 %")
    if q.get("free_scope_eur", 0) > 0.05 * q["net_total"]:
        need("sales_director", "free scope above 5 % of fees")

    return {"approver": approver, "discount": round(discount, 4), "margin": round(margin, 4), "reasons": reasons}


if __name__ == "__main__":
    quote = json.load(open(sys.argv[1]))
    result = gate(quote, yaml.safe_load(open(sys.argv[2])), yaml.safe_load(open(sys.argv[3])))
    print(json.dumps(result, indent=2))
