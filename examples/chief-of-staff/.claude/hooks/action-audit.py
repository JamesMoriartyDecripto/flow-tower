#!/usr/bin/env python3
"""PostToolUse (mcp__workspace__*, mcp__inbox__*): append-only audit of every outside action.

One JSON line per call in logs/audit.log: who (session), what (tool), on what (thread,
review card), and whether it succeeded. Email bodies are not logged, only their hash.
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../logs/audit.log")


def main() -> None:
    p = json.load(sys.stdin)
    tool_input = p.get("tool_input", {})
    body = tool_input.get("body") or tool_input.get("draft") or ""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session": p.get("session_id", "")[:8],
        "tool": p.get("tool_name"),
        "thread": tool_input.get("thread_id", ""),
        "review_id": tool_input.get("review_id", ""),
        "to": tool_input.get("to", tool_input.get("attendees", "")),
        "body_sha1": hashlib.sha1(body.encode()).hexdigest()[:12] if body else "",
        "ok": not (p.get("tool_response") or {}).get("is_error", False),
    }
    with open(LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"action-audit error: {e}", file=sys.stderr)
    sys.exit(0)
