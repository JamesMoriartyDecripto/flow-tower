"""Persistent context memory.

The supervisor writes the whole system state here periodically: hypotheses,
reviews, Elo table, proximity graph, meta-review feedback and statistics.
It is the feedback channel between agents across iterations and what lets a
multi-day run restart after a component fails.
"""
import json
import time
from pathlib import Path

ROOT = Path("/mnt/cosci/state")


def empty_state(plan: dict) -> dict:
    return {
        "plan": plan, "cycle": 0, "hypotheses": {}, "reviews": {}, "ratings": {},
        "matches": {}, "similarity": {}, "vectors": {}, "meta_feedback": [],
        "scientist_inbox": [], "started_at": time.time(),
    }


def save(run_id: str, state: dict) -> None:
    path = ROOT / run_id / f"cycle-{state['cycle']:05d}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {**state, "similarity": [[*k, v] for k, v in state["similarity"].items()]}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.rename(path)  # atomic: a crash never leaves a half-written snapshot


def restore(run_id: str) -> dict | None:
    snapshots = sorted((ROOT / run_id).glob("cycle-*.json"))
    if not snapshots:
        return None
    data = json.loads(snapshots[-1].read_text())
    data["similarity"] = {(a, b): v for a, b, v in data["similarity"]}
    return data
