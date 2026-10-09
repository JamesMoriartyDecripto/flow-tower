"""Agent, environment and one session per batch of pending transactions."""
from pathlib import Path

import anthropic

from config import BATCH_SIZE, MODEL
from handlers import HANDLERS, txns
from resolver import resolve_human_decision
from gate_loop import run_gate_loop
from tools import TOOLS

client = anthropic.Anthropic()
SYSTEM = (Path(__file__).resolve().parent.parent / "prompts/reviewer.md").read_text()

agent = client.beta.agents.create(
    name="MongoDB Atlas fraud reviewer",
    model=MODEL,
    system=SYSTEM,
    tools=TOOLS,  # custom tools only: no agent toolset, no MCP server
    metadata={"anthropic_cookbook": "claude-cookbooks/cma-with-mongodb-atlas"},
)
env = client.beta.environments.create(
    name="fraud-review-env",
    config={"type": "cloud", "networking": {"type": "limited"}},
)


def review_batch() -> None:
    ids = [t["transaction_id"] for t in txns.find({"status": "pending"}, {"transaction_id": 1}).limit(BATCH_SIZE)]
    if not ids:
        return
    session = client.beta.sessions.create(environment_id=env.id, agent=agent.id, title=f"fraud batch {ids[0]}")

    def send(event_id: str, text: str) -> None:
        client.beta.sessions.events.send(session.id, events=[{
            "type": "user.custom_tool_result", "custom_tool_use_id": event_id,
            "content": [{"type": "text", "text": text}]}])

    def nudge(text: str) -> None:
        client.beta.sessions.events.send(session.id, events=[{
            "type": "user.message", "content": [{"type": "text", "text": text}]}])

    with client.beta.sessions.events.stream(session.id) as stream:
        nudge("Review these pending transactions: " + ", ".join(ids))
        run_gate_loop(stream, send, HANDLERS, resolve_human_decision, ids, nudge)
    client.beta.sessions.archive(session.id)


if __name__ == "__main__":
    review_batch()
