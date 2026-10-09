"""Deterministic bank reconciliation passes (collect.match). Rules: collections/reconciliation-rules.yaml.

Usage: python scripts/reconcile.py data/bank-feed-sample.csv open_items.json
open_items.json: [{"invoice_id", "number", "year", "client_vat", "client_iban", "amount", "net", "is_pa"}]
Output per transaction: {"tx", "pass", "invoice_ids", "confidence"} or {"tx", "pass": null} -> agent.
"""
import csv
import json
import re
import sys
from itertools import combinations

PATTERNS = [re.compile(p) for p in (r"FATT(?:URA)?\s*N?\.?\s*(\d{1,6})(?:/(\d{4}))?", r"FT\s*(\d{1,6})", r"INV\s*(\d{1,6})")]
TOL, AUTO, NEVER_AUTO_OVER = 0.01, 0.9, 50000


def numbers_in(text: str) -> set:
    text = re.sub(r"[^A-Z0-9/ ]", " ", text.upper())
    return {int(m.group(1)) for p in PATTERNS for m in p.finditer(text)}


def eq(a: float, b: float) -> bool:
    return abs(a - b) <= TOL


def match(tx: dict, items: list) -> dict:
    amount, nums = float(tx["amount"]), numbers_in(tx["remittance_info"])
    base = {"tx": tx["transaction_id"], "amount": amount}
    if amount <= 0 or amount > NEVER_AUTO_OVER or tx["currency"] != "EUR":
        return {**base, "pass": "never_auto", "invoice_ids": [], "confidence": 0}

    hits = [i for i in items if i["number"] in nums and eq(i["amount"], amount)]
    if len(hits) == 1:
        return {**base, "pass": "number_and_amount", "invoice_ids": [hits[0]["invoice_id"]], "confidence": 1.0}
    hits = [i for i in items if i.get("client_iban") == tx["debtor_iban"] and eq(i["amount"], amount)]
    if len(hits) == 1:
        return {**base, "pass": "iban_and_amount", "invoice_ids": [hits[0]["invoice_id"]], "confidence": 0.97}
    hits = [i for i in items if i["is_pa"] and eq(i["net"], amount) and (i["number"] in nums or not nums)]
    if len(hits) == 1:
        return {**base, "pass": "split_payment_net", "invoice_ids": [hits[0]["invoice_id"]], "confidence": 0.95}
    named = [i for i in items if i["number"] in nums]
    for k in (2, 3, 4):
        for combo in combinations(named, k):
            if len({c["client_vat"] for c in combo}) == 1 and eq(sum(c["amount"] for c in combo), amount):
                return {**base, "pass": "sum_of_items", "invoice_ids": [c["invoice_id"] for c in combo], "confidence": 0.95}
    return {**base, "pass": None, "invoice_ids": [], "confidence": 0}


if __name__ == "__main__":
    items = json.load(open(sys.argv[2]))
    with open(sys.argv[1], newline="") as fh:
        for tx in csv.DictReader(fh):
            result = match(tx, items)
            result["auto_mark_paid"] = result["confidence"] >= AUTO
            print(json.dumps(result))
