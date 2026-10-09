"""Custom tool definitions for the fraud reviewer. All run host-side (Path A): the
MongoDB credential never enters the agent context or the sandbox."""

S, N, B = {"type": "string"}, {"type": "number"}, {"type": "boolean"}
DECISION = {"type": "string", "enum": ["approve", "reject"]}


def _tool(name: str, description: str, props: dict, required: list[str]) -> dict:
    return {"type": "custom", "name": name, "description": description,
            "input_schema": {"type": "object", "properties": props, "required": required}}


TOOLS = [
    _tool("verify_mandates",
          "Verify the AP2 checkout and payment mandates (ES256) and check for double spend. Hard gate.",
          {"transaction_id": S}, ["transaction_id"]),
    _tool("get_transaction", "Fetch one transaction by id.", {"transaction_id": S}, ["transaction_id"]),
    _tool("hybrid_search_similar_frauds",
          "Decided precedents similar to this transaction: $vectorSearch + Atlas Search BM25 fused with $rankFusion.",
          {"transaction_id": S, "k": {"type": "integer", "default": 5}}, ["transaction_id"]),
    _tool("detect_fraud_ring", "Follow money from an account with $graphLookup (max depth 4).",
          {"account_id": S}, ["account_id"]),
    _tool("record_decision",
          "TERMINAL. Record the final decision for one transaction. Call exactly once per transaction.",
          {"transaction_id": S, "decision": DECISION, "reasoning": S, "confidence": N,
           "risk_factors": {"type": "array", "items": S}, "escalated": B, "recommended_decision": DECISION},
          ["transaction_id", "decision", "reasoning"]),
    _tool("escalate",
          "Send the case to a human analyst. Not terminal: returns {human_decision}.",
          {"transaction_id": S, "recommended_decision": DECISION, "reason": S, "confidence": N},
          ["transaction_id", "recommended_decision", "reason"]),
]

TERMINAL = {"record_decision"}
HUMAN = {"escalate"}  # deliberately absent from HANDLERS: routed to the resolver
