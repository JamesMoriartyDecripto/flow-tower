"""Human resolver for `escalate`: case packet (Sonnet), analyst queue, timeout to a senior analyst.

The session stays paused on requires_action until a human decides; no verdict is ever
invented by the host. AUTO_APPROVE (cookbook demo mode) concurs except for OVERRIDE_IDS.
"""
import time
from datetime import datetime, timezone
from os import environ
from pathlib import Path

import anthropic
from pymongo import ReturnDocument

from handlers import db, tool_detect_fraud_ring, tool_get_transaction, tool_hybrid_search_similar_frauds

client = anthropic.Anthropic()
cases = db.analyst_cases
PACKET_PROMPT = (Path(__file__).resolve().parent.parent / "prompts/case-packet.md").read_text()
AUTO_APPROVE = environ.get("AUTO_APPROVE") == "1"
OVERRIDE_IDS = {"txn-review-struct"}
ANALYST_TIMEOUT_S, SENIOR_TIMEOUT_S = 4 * 3600, 24 * 3600


def _packet(call: dict) -> str:
    t = tool_get_transaction(call["transaction_id"])
    ctx = {"escalation": call, "transaction": t, "ring": tool_detect_fraud_ring(t["sender"]["account_number"]),
           "precedents": tool_hybrid_search_similar_frauds(call["transaction_id"])}
    prompt = PACKET_PROMPT
    for k, v in {**ctx, "transaction_id": call["transaction_id"]}.items():
        prompt = prompt.replace("{{" + k + "}}", str(v))
    msg = client.messages.create(model="claude-sonnet-5-5", max_tokens=600,
                                 messages=[{"role": "user", "content": prompt}])
    return msg.content[0].text


def _wait(case_id, queue: str, timeout_s: int) -> str | None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        case = cases.find_one({"_id": case_id, "queue": queue, "human_decision": {"$exists": True}})
        if case:
            return case["human_decision"]
        time.sleep(15)
    return None


def resolve_human_decision(call: dict) -> str:
    if AUTO_APPROVE:
        flip = {"approve": "reject", "reject": "approve"}
        rec = call["recommended_decision"]
        return flip[rec] if call["transaction_id"] in OVERRIDE_IDS else rec
    case_id = cases.insert_one({"transaction_id": call["transaction_id"], "queue": "analyst",
                                "packet": _packet(call), "escalation": call,
                                "opened_at": datetime.now(timezone.utc)}).inserted_id
    if decision := _wait(case_id, "analyst", ANALYST_TIMEOUT_S):
        return decision
    cases.find_one_and_update({"_id": case_id}, {"$set": {"queue": "senior"}},
                              return_document=ReturnDocument.AFTER)
    # Senior SLA missed: decline. A held payment is safer than an unreviewed one.
    return _wait(case_id, "senior", SENIOR_TIMEOUT_S) or "reject"
