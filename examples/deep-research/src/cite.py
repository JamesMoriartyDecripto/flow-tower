"""CitationAgent: attach sources to claims after the research loop ends.

The documents go in as `document` blocks with citations enabled, so the API
returns char-level citations the agent can map back to [n] markers.
"""
from anthropic import AsyncAnthropic

from config import MODELS
from prompt_templates import render

client = AsyncAnthropic()


def as_documents(sources: list[dict]) -> list[dict]:
    return [
        {
            "type": "document",
            "source": {"type": "text", "media_type": "text/plain", "data": s["text"]},
            "title": s["url"],
            "citations": {"enabled": True},
        }
        for s in sources
    ]


async def add_citations(draft: str, sources: list[dict]) -> str:
    listing = "\n".join(f"[{i + 1}] {s['url']}" for i, s in enumerate(sources))
    response = await client.messages.create(
        model=MODELS["citations"],
        max_tokens=32000,
        system=render("citation-agent", report="(see last block)", sources=listing),
        messages=[{
            "role": "user",
            "content": [*as_documents(sources), {"type": "text", "text": draft}],
        }],
    )
    return "".join(b.text for b in response.content if b.type == "text")
