"""Lawful-basis and channel check for one prospect, before any enrichment credit is spent.

Usage: python scripts/lawful_basis.py prospect.json compliance/channel-rules.yaml suppression.txt
prospect.json: {"country": "IT", "source": "atoka", "role_in_icp": true, "consent": null | {...},
                "existing_customer": false, "email": "...", "phone": "...", "rpo_checked_at": "2026-10-01"}
Output: {"allowed": bool, "basis": str, "channels": [...], "reasons": [...]}
Deterministic on purpose: the agent never decides whether a person may be contacted.
"""
import json
import sys
from datetime import date, datetime

import yaml

FORBIDDEN_SOURCES = {"ini-pec", "purchased-email-lists", "scraped-websites-email"}


def decide(p: dict, rules: dict, suppressed: set) -> dict:
    reasons, channels = [], []
    if p.get("email", "").lower() in suppressed or p.get("phone") in suppressed:
        return {"allowed": False, "basis": "none", "channels": [], "reasons": ["on suppression list"]}
    if p.get("source") in FORBIDDEN_SOURCES:
        return {"allowed": False, "basis": "none", "channels": [], "reasons": [f"forbidden source {p['source']}"]}

    country = rules["countries"].get(p.get("country"), rules["countries"]["OTHER"])
    email = country["email"]
    consent, customer = p.get("consent"), p.get("existing_customer", False)

    if consent and email.get("with_consent"):
        channels.append("email")
        basis = "consent"
    elif customer and email.get("existing_customer_similar_service"):
        channels.append("email")
        basis = "existing customer, similar service (art. 130(4))"
    elif email.get("cold") and p.get("role_in_icp"):
        channels.append("email")
        basis = "legitimate interest, role-relevant B2B email"
    else:
        basis = "legitimate interest (research, calls)"
        reasons.append("email not allowed without consent in this country")

    phone = country.get("phone", {})
    if phone.get("allowed") and p.get("phone"):
        checked = p.get("rpo_checked_at")
        fresh = checked and (date.today() - datetime.fromisoformat(checked).date()).days <= 30
        if p.get("country") != "IT" or fresh:
            channels.append("call")
        else:
            reasons.append("phone needs an RPO check younger than 30 days")

    if country.get("linkedin", {}).get("allowed") == "manual_only":
        channels.append("linkedin_manual")

    allowed = bool(channels) and (p.get("role_in_icp") or consent or customer)
    if not p.get("role_in_icp"):
        reasons.append("role not in persona list")
    return {"allowed": bool(allowed), "basis": basis, "channels": channels, "reasons": reasons}


if __name__ == "__main__":
    prospect = json.load(open(sys.argv[1]))
    rules = yaml.safe_load(open(sys.argv[2]))
    suppressed = {line.strip().lower() for line in open(sys.argv[3]) if line.strip()}
    result = decide(prospect, rules, suppressed)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["allowed"] else 4)
