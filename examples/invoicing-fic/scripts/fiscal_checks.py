"""Deterministic fiscal checks on a draft (draft.fiscal, draft.numbering). No model involved.

Rules and SDI error codes: rules/vat-fiscal-rules.md (Specifiche tecniche SdI v1.9, AdE guides).
Input: the draft JSON produced by the payload builder plus resolved vat cases per line.
Output: {"hard": [...], "warnings": [...], "stamp_duty": 0 | 2.0}
Usage: python scripts/fiscal_checks.py draft.json
"""
import json
import sys
from datetime import date

BOLLO_NATURE = {"N2.1", "N2.2", "N3.5", "N3.6", "N4"}  # AdE elenco B criteria (June 2026 guide)
BOLLO_THRESHOLD = 77.47


def partita_iva_ok(piva: str) -> bool:
    """Italian VAT number control digit (Luhn-style variant over 11 digits)."""
    if len(piva) != 11 or not piva.isdigit():
        return False
    odd = sum(int(d) for d in piva[0:10:2])
    even = sum((2 * int(d)) - 9 if 2 * int(d) > 9 else 2 * int(d) for d in piva[1:10:2])
    return (10 - (odd + even) % 10) % 10 == int(piva[10])


def check(draft: dict, today: date) -> dict:
    hard, warn = [], []
    d, client = draft["data"], draft["client_profile"]
    lines = draft["lines"]  # [{net_total, vat_rate, natura, ritenuta}]

    if client.get("country_iso") == "IT" and client.get("vat_number") and not partita_iva_ok(client["vat_number"]):
        hard.append("client.vat_number control digit (SDI 00305)")
    for i, ln in enumerate(lines):
        if ln["vat_rate"] == 0 and not ln.get("natura"):
            hard.append(f"line {i}: natura missing at 0 % (SDI 00400)")
        if ln["vat_rate"] > 0 and ln.get("natura"):
            hard.append(f"line {i}: natura with rate > 0 (SDI 00401)")

    has_rc = any((ln.get("natura") or "").startswith("N6") for ln in lines)
    if d.get("use_split_payment") and has_rc:
        hard.append("split payment with reverse charge (SDI 00420)")
    if client.get("is_pa") and not d.get("use_split_payment"):
        warn.append("PA client without split payment: check exemption")
    if any(ln.get("ritenuta") for ln in lines) and not d.get("withholding_tax"):
        hard.append("line flagged ritenuta without withholding data (SDI 00411)")

    non_vat = sum(ln["net_total"] for ln in lines if ln.get("natura") in BOLLO_NATURE)
    stamp = 2.0 if non_vat > BOLLO_THRESHOLD else 0
    if stamp and not d.get("stamp_duty"):
        warn.append(f"bollo due: {non_vat:.2f} EUR not subject to VAT > 77.47; stamp_duty set to 2.00")

    eff = date.fromisoformat(draft["effettuazione_date"])
    inv = date.fromisoformat(d["date"])
    if inv > today:
        hard.append("invoice date in the future (SDI 00403)")
    if draft.get("deferred"):
        limit = date(eff.year + (eff.month == 12), eff.month % 12 + 1, 15)
        if today > limit:
            hard.append(f"deferred invoice past the 15th: limit was {limit}")
    elif (today - eff).days > 12:
        hard.append(f"immediate invoice {(today - eff).days} days after effettuazione (> 12)")
    elif (today - eff).days >= 8:
        warn.append("12-day clock: day 8 or later")

    if draft.get("last_number") is not None and d.get("number") not in (None, draft["last_number"] + 1):
        hard.append("numbering gap or reuse in this numeration")
    return {"hard": hard, "warnings": warn, "stamp_duty": stamp}


if __name__ == "__main__":
    result = check(json.load(open(sys.argv[1])), date.today())
    print(json.dumps(result, indent=2))
    sys.exit(3 if result["hard"] else 0)
