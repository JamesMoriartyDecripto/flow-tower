"""Dedupe new prospects against the CRM export and the suppression list.

Usage: python scripts/dedupe_prospects.py new.jsonl crm_export.jsonl suppression.txt > fresh.jsonl
Match keys, strongest first: VAT number, company domain, normalized email.
Personal email domains are dropped (we only contact work addresses).
Runs before enrichment so no credits are spent on people we already know or must not contact.
"""
from __future__ import annotations

import json
import sys

PERSONAL_DOMAINS = {"gmail.com", "yahoo.com", "yahoo.it", "hotmail.com", "hotmail.it",
                    "outlook.com", "libero.it", "virgilio.it", "icloud.com", "tiscali.it"}


def norm_email(e: str | None) -> str:
    return (e or "").strip().lower()


def domain(rec: dict) -> str:
    d = (rec.get("domain") or norm_email(rec.get("email")).split("@")[-1]).lower()
    return d.removeprefix("www.")


def load(path: str) -> list[dict]:
    return [json.loads(line) for line in open(path) if line.strip()]


def main(new_path: str, crm_path: str, supp_path: str) -> None:
    crm = load(crm_path)
    vats = {r["vat_number"] for r in crm if r.get("vat_number")}
    open_deal_domains = {domain(r) for r in crm if r.get("open_deal")}
    emails = {norm_email(r.get("email")) for r in crm}
    suppressed = {line.strip().lower() for line in open(supp_path) if line.strip()}

    kept, dropped = 0, {"suppressed": 0, "personal": 0, "crm": 0, "open_deal": 0, "dup": 0}
    seen: set[str] = set()
    for rec in load(new_path):
        e, d = norm_email(rec.get("email")), domain(rec)
        key = rec.get("vat_number") or d
        if e and (e in suppressed or d in suppressed):
            dropped["suppressed"] += 1
        elif d in PERSONAL_DOMAINS:
            dropped["personal"] += 1
        elif d in open_deal_domains:
            dropped["open_deal"] += 1
        elif (e and e in emails) or rec.get("vat_number") in vats and not rec.get("new_contact"):
            dropped["crm"] += 1
        elif f"{key}|{e}" in seen:
            dropped["dup"] += 1
        else:
            seen.add(f"{key}|{e}")
            kept += 1
            print(json.dumps(rec, ensure_ascii=False))
    print(json.dumps({"kept": kept, "dropped": dropped}), file=sys.stderr)


if __name__ == "__main__":
    main(*sys.argv[1:4])
