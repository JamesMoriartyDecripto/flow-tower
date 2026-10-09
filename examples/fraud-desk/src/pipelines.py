"""Aggregation pipelines: hybrid retrieval ($rankFusion, MongoDB 8.0+) and the ring graph."""
from config import DECIDED_STATUSES, LEXICAL_PATHS, SEARCH_INDEX_NAME, VECTOR_INDEX_NAME


def build_vector_pipeline(query_vector: list[float], limit: int) -> list[dict]:
    return [{"$vectorSearch": {
        "index": VECTOR_INDEX_NAME, "path": "embedding", "queryVector": query_vector,
        "numCandidates": max(50, limit * 10), "limit": limit,
        "filter": {"status": {"$in": DECIDED_STATUSES}},  # precedent only: decided cases
    }}]


def build_lexical_pipeline(query: str, limit: int) -> list[dict]:
    return [
        {"$search": {"index": SEARCH_INDEX_NAME, "text": {"query": query, "path": LEXICAL_PATHS}}},
        {"$match": {"status": {"$in": DECIDED_STATUSES}}},
        {"$limit": limit},
    ]


def build_rank_fusion_pipeline(query_vector: list[float], query: str, k: int = 5,
                               weights: dict | None = None) -> list[dict]:
    per_branch = max(k * 4, 20)
    return [
        {"$rankFusion": {
            "input": {"pipelines": {
                "vector": build_vector_pipeline(query_vector, per_branch),
                "lexical": build_lexical_pipeline(query, per_branch),
            }},
            "combination": {"weights": weights or {"vector": 1, "lexical": 1}},
        }},
        {"$limit": k},
        {"$project": {"_id": 0, "transaction_id": 1, "amount": 1, "status": 1, "lane": 1,
                      "text": 1, "score": {"$meta": "score"}}},
    ]


def build_graph_pipeline(account: str, max_depth: int = 4) -> list[dict]:
    return [
        {"$match": {"sender.account_number": account}},
        {"$graphLookup": {
            "from": "transactions", "startWith": "$recipient.account_number",
            "connectFromField": "recipient.account_number", "connectToField": "sender.account_number",
            "as": "chain", "maxDepth": max_depth, "depthField": "depth",
        }},
    ]


def summarize_ring(seed: str, docs: list[dict]) -> dict:
    edges = [d for doc in docs for d in [doc, *doc.get("chain", [])]]
    accounts = {e["sender"]["account_number"] for e in edges} | {e["recipient"]["account_number"] for e in edges}
    circular = any(e["recipient"]["account_number"] == seed for e in edges)
    small = sum(1 for e in edges if e["amount"] < 1000)
    return {
        "network_size": len(accounts), "unique_accounts": sorted(a[-4:] for a in accounts),
        "circular_flow": circular, "layering": small >= 5, "small_transfers": small,
        "suspicious_patterns": circular or small >= 5 or len(accounts) >= 3,
    }
