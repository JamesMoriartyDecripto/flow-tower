"""End-to-end run: clarify -> brief -> lead + searchers -> write -> cite -> verify.

Called by the chat backend (one request = one run). Every phase checkpoints,
so a crash resumes from the failed phase instead of re-running searches.
"""
import asyncio
import json
import uuid

from anthropic import AsyncAnthropic

from cite import add_citations
from config import LIMITS, MODELS
from lead import research
from plan_store import checkpoint, load_artifacts
from prompt_templates import render
from verify_loop import verify

client = AsyncAnthropic()


async def ask(role: str, prompt: str, user: str, max_tokens: int = 8192) -> str:
    response = await client.messages.create(
        model=MODELS[role], max_tokens=max_tokens, system=prompt,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in response.content if b.type == "text")


async def run(messages: list[dict], mcp_tools: list[dict]) -> dict:
    run_id = uuid.uuid4().hex[:12]
    thread = json.dumps(messages)

    if LIMITS.allow_clarification:
        decision = json.loads(await ask("clarify", render("clarify", messages=thread), thread))
        if decision["need_clarification"]:
            return {"status": "needs_input", "question": decision["question"]}

    brief = json.loads(await ask("brief", render("research-brief", messages=thread), thread))
    checkpoint(run_id, "brief", brief)

    notes = await research(run_id, brief, mcp_tools)
    findings = "\n\n---\n\n".join(notes)
    draft = await ask("writer", render("writer", brief=brief["brief"], findings=findings, issues="none"),
                      "Write the report.", max_tokens=32000)
    checkpoint(run_id, "draft", {"draft": draft})

    sources = load_artifacts(run_id)
    cited = await add_citations(draft, sources)
    final, issues = await verify(run_id, brief, cited, findings, sources)
    return {"status": "done" if not issues else "done_with_issues", "run_id": run_id,
            "report": final, "open_issues": issues}


if __name__ == "__main__":
    question = [{"role": "user", "content": "Compare EU and US rules on AI in hiring, 2023-2026."}]
    print(asyncio.run(run(question, mcp_tools=[]))["status"])
