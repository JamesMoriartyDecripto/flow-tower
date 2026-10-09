"""Research Helper: one agent, server-side web search, a single tool loop."""
import sys

import anthropic

client = anthropic.Anthropic()
SYSTEM = open("prompts/system.md").read()
TOOLS = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}]


def ask(question: str) -> str:
    messages = [{"role": "user", "content": question}]
    while True:
        reply = client.messages.create(
            model="claude-sonnet-5-5", max_tokens=2000, system=SYSTEM, tools=TOOLS, messages=messages,
        )
        # Server tools run inside the API call; "pause_turn" means the loop needs another round.
        if reply.stop_reason != "pause_turn":
            return "".join(b.text for b in reply.content if b.type == "text")
        messages.append({"role": "assistant", "content": reply.content})


if __name__ == "__main__":
    print(ask(" ".join(sys.argv[1:]) or "What changed in the latest Python release?"))
