"""Learning from feedback: every edit, rejection or free-text answer becomes a memory update.

The diff between the draft and what the user actually sent is the signal. A reflection
run decides which section of memory/preferences.md to change and rewrites only that
section, so one bad lesson cannot wipe the rest.
"""
import difflib
import json

from claude_agent_sdk import ClaudeAgentOptions, query

SECTIONS = ["Triage: ignore", "Triage: notify", "Triage: respond", "Writing style", "Scheduling"]


def feedback_event(card: dict, response: dict) -> dict | None:
    if response["action"] == "approve":
        return None  # approval without edits teaches nothing new
    if response["action"] == "edit":
        diff = "\n".join(difflib.unified_diff(card["draft"].splitlines(),
                                              response["args"].splitlines(), lineterm=""))
        return {"kind": "edit", "diff": diff, "thread": card["thread_id"]}
    return {"kind": response["action"], "text": response.get("args", ""), "thread": card["thread_id"]}


async def reflect(event: dict) -> str:
    options = ClaudeAgentOptions(
        model="claude-opus-5-5",
        allowed_tools=["Read", "Edit"],          # may only edit the preferences file
        permission_mode="acceptEdits",
        system_prompt=open("prompts/reflection.md", encoding="utf-8").read(),
        cwd=".",
        max_turns=6,
    )
    prompt = (f"Sections you may change: {SECTIONS}\nFeedback:\n{json.dumps(event)}\n"
              "Edit memory/preferences.md. Add a dated rule; never delete rules the user wrote.")
    result = ""
    async for msg in query(prompt=prompt, options=options):
        result = getattr(msg, "result", result) or result
    return result
