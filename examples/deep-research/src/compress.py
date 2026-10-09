"""Compress a searcher's history into a cited findings document.

Mirrors open_deep_research's compress_research: up to 3 attempts, and on a
context overflow drop the oldest tool results and retry.
"""
import anthropic
from anthropic import AsyncAnthropic

from config import MODELS
from prompt_templates import render

client = AsyncAnthropic()
MAX_ATTEMPTS = 3


async def compress(task: str, messages: list[dict]) -> str:
    history = list(messages)
    for _ in range(MAX_ATTEMPTS):
        try:
            response = await client.messages.create(
                model=MODELS["compress"],
                max_tokens=8192,
                system=render("compress", task=task),
                messages=[*history, {"role": "user", "content": "Compress your findings now."}],
            )
            return "".join(b.text for b in response.content if b.type == "text")
        except anthropic.BadRequestError as err:
            if "prompt is too long" not in str(err) or len(history) <= 2:
                raise
            history = trim_oldest_turn(history)
    return "Error synthesizing research: maximum retries exceeded"


def trim_oldest_turn(history: list[dict]) -> list[dict]:
    """Keep the task message, drop the oldest assistant/user exchange."""
    return [history[0], *history[3:]]
