"""Evidence check for personalized lines (guards against hallucinated personalization).

Usage: python scripts/verify_personalization.py draft.json evidence.json
draft.json:    {"prospect_id": "...", "lines": [{"slot": "personal_line", "text": "...",
                "claims": [{"text": "opened a second plant in Modena", "cite": "ev-2"}]}]}
evidence.json: {"ev-2": {"kind": "url", "url": "https://...", "fetched_at": "2026-10-07",
                "content": "<page text>"}, "ev-3": {"kind": "field", "field": "employees", "value": 180}}
A claim passes only if its cited evidence exists, is younger than 270 days and contains the
claim's key terms (URL) or the exact value (field). A line with any failing claim is replaced
by the template default and the reason is logged.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date

MAX_AGE_DAYS = 270
STOP = {"the", "a", "an", "of", "in", "and", "to", "di", "il", "la", "e", "un", "una", "le", "des", "du"}


def key_terms(text: str) -> set[str]:
    words = re.findall(r"[\w'-]{3,}", text.lower())
    return {w for w in words if w not in STOP}


def check_claim(claim: dict, evidence: dict) -> str | None:
    ev = evidence.get(claim.get("cite", ""))
    if not ev:
        return "no citation"
    if ev.get("fetched_at"):
        if (date.today() - date.fromisoformat(ev["fetched_at"])).days > MAX_AGE_DAYS:
            return "evidence too old"
    if ev["kind"] == "field":
        return None if str(ev["value"]) in claim["text"] else "field value not in claim"
    terms = key_terms(claim["text"])
    found = {t for t in terms if t in ev.get("content", "").lower()}
    return None if terms and len(found) / len(terms) >= 0.6 else "claim not supported by source"


def verify(draft: dict, evidence: dict) -> dict:
    results = []
    for line in draft["lines"]:
        failures = [r for c in line.get("claims", []) if (r := check_claim(c, evidence))]
        numbers = re.findall(r"\d+", line["text"])
        cited_text = " ".join(c["text"] for c in line.get("claims", []))
        if any(n not in cited_text for n in numbers):
            failures.append("number without citation")
        results.append({"slot": line["slot"], "ok": not failures, "reasons": failures})
    return {"prospect_id": draft["prospect_id"], "lines": results,
            "use_defaults_for": [r["slot"] for r in results if not r["ok"]]}


if __name__ == "__main__":
    out = verify(json.load(open(sys.argv[1])), json.load(open(sys.argv[2])))
    print(json.dumps(out, indent=2, ensure_ascii=False))
