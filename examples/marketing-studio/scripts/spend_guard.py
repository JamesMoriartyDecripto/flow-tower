"""Spend guard: validates an optimizer change set against policies/spend-approval-policy.yaml.

Usage: python scripts/spend_guard.py changeset.json policies/spend-approval-policy.yaml state.json
state.json: {"spend_mtd": float, "projected_month": float, "in_learning": [ids],
             "edits_this_week": {id: n}, "top5_campaigns": [ids]}
Output: {"decision": "reject" | "auto_apply" | "needs_growth" | "needs_finance", "reasons": [...]}
The guard is deterministic on purpose: the agent cannot negotiate with it.
"""
import json
import sys

import yaml


def evaluate(changes: list, policy: dict, state: dict) -> dict:
    hard, auto = policy["hard_limits"], policy["auto_apply"]
    reasons, delta_day, cross_channel = [], 0.0, 0.0

    for c in changes:
        cid, field = c["entity_id"], c["field"]
        if c.get("type") in hard["forbidden_changes"]:
            reasons.append(f"{cid}: forbidden change type {c['type']}")
        if hard["learning_phase_freeze"] and cid in state["in_learning"] and field != "status":
            reasons.append(f"{cid}: in learning phase")
        if state["edits_this_week"].get(cid, 0) >= hard["max_budget_edits_per_entity_per_week"]:
            reasons.append(f"{cid}: weekly edit limit reached")
        if field == "daily_budget":
            before, after = float(c["before"]), float(c["after"])
            if before and abs(after - before) / before > hard["max_change_pct_per_entity"]:
                reasons.append(f"{cid}: change > {hard['max_change_pct_per_entity']:.0%}")
            delta_day += abs(after - before)
            cross_channel += c.get("cross_channel_eur_month", 0.0)

    # Projected month after the change must stay under the hard cap.
    added = sum(float(c["after"]) - float(c["before"]) for c in changes if c["field"] == "daily_budget")
    days_left = int(state.get("days_left_in_month", 0))
    if state["projected_month"] + added * days_left > hard["monthly_media_cap"]:
        reasons.append("projected month exceeds monthly_media_cap")

    if reasons:
        return {"decision": "reject", "reasons": reasons}

    base = sum(float(c["before"]) for c in changes if c["field"] == "daily_budget") or 1.0
    pauses_top5 = any(c["field"] == "status" and c["after"] == "PAUSED"
                      and c["entity_id"] in state["top5_campaigns"] for c in changes)
    if cross_channel > 5000:
        return {"decision": "needs_finance", "reasons": [f"cross-channel {cross_channel:.0f} EUR/month"]}
    if delta_day > auto["max_delta_eur_per_day"] or delta_day / base > auto["max_delta_pct"] or pauses_top5:
        return {"decision": "needs_growth", "reasons": [f"delta {delta_day:.0f} EUR/day"]}
    return {"decision": "auto_apply", "reasons": []}


if __name__ == "__main__":
    changeset = json.load(open(sys.argv[1]))
    policy = yaml.safe_load(open(sys.argv[2]))
    state = json.load(open(sys.argv[3]))
    result = evaluate(changeset["changes"], policy, state)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["decision"] != "reject" else 3)
