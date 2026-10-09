#!/usr/bin/env python3
"""PostToolUse (Write|Edit): keeps a compliance history of every file the agent writes.

Same as the cookbook hook, minus debug prints. The cookbook's settings.local.json points the Edit
matcher at "report-tracker.py123", so edits were never tracked there; one matcher fixes it.
"""
import json
import os
import sys
from datetime import datetime

HISTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../audit/report_history.json")


def track(tool_name: str, tool_input: dict) -> None:
    file_path = tool_input.get("file_path", "")
    if not file_path:
        return
    history = {"reports": []}
    if os.path.exists(HISTORY):
        with open(HISTORY) as f:
            history = json.load(f)
    content = tool_input.get("content", "") or tool_input.get("new_string", "")
    history["reports"].append({
        "timestamp": datetime.now().isoformat(),
        "file": os.path.basename(file_path),
        "path": file_path,
        "action": "created" if tool_name == "Write" else "modified",
        "word_count": len(content.split()),
        "tool": tool_name,
    })
    history["reports"] = history["reports"][-50:]  # keep the last 50
    os.makedirs(os.path.dirname(HISTORY), exist_ok=True)
    with open(HISTORY, "w") as f:
        json.dump(history, f, indent=2)


if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
        track(data.get("tool_name", ""), data.get("tool_input", {}))
    except Exception as e:  # a broken audit must never break the agent
        print(f"report-tracker error: {e}", file=sys.stderr)
    sys.exit(0)
