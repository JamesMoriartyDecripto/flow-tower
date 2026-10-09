"""In-process MCP server `inbox`: the only way the agent reaches the human.

Three kinds, after LangChain's ambient-agent patterns:
  notify   - FYI, no action taken          (user can respond or dismiss)
  question - agent is blocked on a fact    (user responds or dismisses)
  review   - agent wants to act            (user approves, edits, rejects or responds)
Cards appear in the Review Inbox app and as a push notification on the user's phone.
"""
import json
import uuid

from claude_agent_sdk import create_sdk_mcp_server, tool

from ambient.state import _db

ACTIONS = {
    "notify": ["respond", "dismiss"],
    "question": ["respond", "dismiss"],
    "review": ["approve", "edit", "reject", "respond"],
}


def _queue(kind: str, args: dict) -> dict:
    card_id = f"{kind}-{uuid.uuid4().hex[:8]}"
    payload = {**args, "allowed": ACTIONS[kind]}
    with _db() as conn:
        conn.execute("INSERT INTO inbox (id, kind, thread_id, payload) VALUES (?, ?, ?, ?)",
                     (card_id, kind, args.get("thread_id", ""), json.dumps(payload)))
    # The run ends here; the user's answer starts a new run on the same thread (resume).
    return {"content": [{"type": "text", "text": f"Queued {kind} card {card_id}. Stop and wait."}]}


@tool("notify", "Tell the user something important happened. Takes no action.",
      {"thread_id": str, "title": str, "summary": str})
async def notify(args):
    return _queue("notify", args)


@tool("ask_question", "Ask the user one question you cannot answer from memory or tools.",
      {"thread_id": str, "question": str, "context": str})
async def ask_question(args):
    return _queue("question", args)


@tool("request_review", "Propose an action (email, invite, plan) for approval before doing it.",
      {"thread_id": str, "action": str, "draft": str, "rationale": str})
async def request_review(args):
    return _queue("review", args)


inbox_server = create_sdk_mcp_server(name="inbox", version="1.0.0",
                                     tools=[notify, ask_question, request_review])
INBOX_TOOLS = ["mcp__inbox__notify", "mcp__inbox__ask_question", "mcp__inbox__request_review"]
