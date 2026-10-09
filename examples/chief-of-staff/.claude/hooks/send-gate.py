#!/usr/bin/env python3
"""PreToolUse (send_email|send_invite): deny unless the review card was approved by the user.

The agent can draft anything; it can only send what the human approved or edited in the
Review Inbox. Exit 0 with a JSON permission decision either way.
"""
import json
import os
import sqlite3
import sys

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../memory/ambient.sqlite3")


def decide(tool_input: dict) -> tuple[str, str]:
    review_id = tool_input.get("review_id", "")
    if not review_id:
        return "deny", "No review_id: call mcp__inbox__request_review first."
    with sqlite3.connect(DB) as conn:
        row = conn.execute("SELECT status FROM inbox WHERE id = ?", (review_id,)).fetchone()
    if not row or row[0] != "approved":
        return "deny", f"Review {review_id} is not approved (status: {row[0] if row else 'missing'})."
    return "allow", f"Approved in the Review Inbox ({review_id})."


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    decision, reason = decide(payload.get("tool_input", {}))
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)
