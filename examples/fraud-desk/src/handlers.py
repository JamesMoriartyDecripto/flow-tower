"""Host-side handlers (pymongo). One function per data tool; escalate is not here."""
import hashlib
import uuid
from datetime import datetime, timezone

from pymongo import MongoClient

from ap2_mandates import verify
from config import DB_NAME, MONGO_URI, RING_MAX_DEPTH
from pipelines import build_graph_pipeline, build_rank_fusion_pipeline, summarize_ring

db = MongoClient(MONGO_URI)[DB_NAME]
txns, decisions, audit, receipts = db.transactions, db.transaction_decisions, db.audit_events, db.mandate_receipts
STATUS = {"approve": "approved", "reject": "rejected"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def tool_get_transaction(transaction_id: str) -> dict:
    return txns.find_one({"transaction_id": transaction_id}, {"_id": 0, "embedding": 0, "checkout_mandate_jwt": 0})


def tool_verify_mandates(transaction_id: str) -> dict:
    t = txns.find_one({"transaction_id": transaction_id})
    return verify(t, receipts)  # {valid, constraints_satisfied, double_spend_detected, detail}


def tool_hybrid_search_similar_frauds(transaction_id: str, k: int = 5) -> dict:
    t = txns.find_one({"transaction_id": transaction_id})
    hits = list(txns.aggregate(build_rank_fusion_pipeline(t["embedding"], t["text"], k)))
    return {"precedents": [h for h in hits if h["transaction_id"] != transaction_id]}


def tool_detect_fraud_ring(account_id: str) -> dict:
    docs = list(txns.aggregate(build_graph_pipeline(account_id, RING_MAX_DEPTH)))
    return summarize_ring(account_id, docs)


def tool_record_decision(transaction_id: str, decision: str, reasoning: str, confidence: float | None = None,
                         risk_factors: list[str] | None = None, escalated: bool = False,
                         recommended_decision: str | None = None, human_decision: str | None = None) -> dict:
    decision_id = str(uuid.uuid4())
    decisions.insert_one({
        "decision_id": decision_id, "transaction_id": transaction_id, "decision": decision,
        "confidence_score": confidence, "risk_factors": risk_factors or [], "reasoning": reasoning,
        "reviewed_by": "human" if escalated else "agent", "created_at": _now()})
    txns.update_one({"transaction_id": transaction_id, "status": "pending"},
                    {"$set": {"status": STATUS[decision]}})
    audit.insert_one({  # append-only: the host role has insert + find only on audit_events
        "event_type": "escalated_to_human" if escalated else "decision_stored",
        "severity": "warning" if escalated else "info",
        "transaction_id": transaction_id, "decision_id": decision_id, "timestamp": _now(),
        "event_data": {"decision": decision, "recommended_decision": recommended_decision,
                       "human_decision": human_decision}})
    if decision == "approve":
        t = txns.find_one({"transaction_id": transaction_id})
        receipts.insert_one({"mandate_id": t["mandate_id"], "agent_pk": t["agent_pk"], "decision": decision,
                             "jwt_sha256": hashlib.sha256(t["checkout_mandate_jwt"].encode()).hexdigest()})
    return {"decision_id": decision_id, "status": STATUS[decision]}


HANDLERS = {
    "verify_mandates": tool_verify_mandates,
    "get_transaction": tool_get_transaction,
    "hybrid_search_similar_frauds": tool_hybrid_search_similar_frauds,
    "detect_fraud_ring": tool_detect_fraud_ring,
    "record_decision": tool_record_decision,
}
