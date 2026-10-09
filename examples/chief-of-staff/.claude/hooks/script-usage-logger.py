#!/usr/bin/env python3
"""PostToolUse (Bash): logs which scripts/ the agent ran, to tell tools from scripts."""
import json
import os
import re
import sys
from datetime import datetime

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../audit/script_usage_log.json")
SCRIPT = re.compile(r"(?:python\s+)?(?:\./)?scripts/(\w+\.py)")


def log(tool_input: dict, tool_response: dict) -> None:
    command = tool_input.get("command", "")
    match = SCRIPT.search(command)
    if not match:
        return
    data = {"script_executions": []}
    if os.path.exists(LOG):
        with open(LOG) as f:
            data = json.load(f)
    data["script_executions"].append({
        "timestamp": datetime.now().isoformat(),
        "script": match.group(1),
        "command": command,
        "description": tool_input.get("description", "No description"),
        "tool_used": "Bash",
        "success": (tool_response or {}).get("success", True),
    })
    data["script_executions"] = data["script_executions"][-100:]
    with open(LOG, "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        if payload.get("tool_name") == "Bash":
            log(payload.get("tool_input", {}), payload.get("tool_response", {}))
    except Exception as e:
        print(f"script-usage-logger error: {e}", file=sys.stderr)
    sys.exit(0)
