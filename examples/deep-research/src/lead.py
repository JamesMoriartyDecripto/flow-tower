"""Lead researcher: plan, save the plan, fan out searchers, reflect, repeat.

Orchestrator-worker. Searchers in one round run concurrently, bounded by a
semaphore; the lead waits for the whole round before reflecting (synchronous
rounds are simpler to reason about, at the cost of waiting on the slowest).
"""
import asyncio
import json

from anthropic import AsyncAnthropic

from config import EFFORT, LIMITS, MODELS, plan_for
from plan_store import checkpoint, save_plan
from prompt_templates import render
from searcher import run_searcher

client = AsyncAnthropic()
gate = asyncio.Semaphore(LIMITS.max_concurrent_research_units)


async def plan_round(run_id: str, brief: dict, notes: list[str]) -> dict:
    response = await client.messages.create(
        model=MODELS["lead"],
        max_tokens=16000,
        system=render("lead-researcher", **brief, run_id=run_id,
                      max_concurrent=LIMITS.max_concurrent_research_units,
                      max_rounds=LIMITS.max_researcher_iterations),
        output_config={"effort": EFFORT["lead"]},
        messages=[{"role": "user", "content": json.dumps({"notes": notes})}],
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    return json.loads(text)  # {"tasks": [...], "complete": bool, "reflection": str}


async def bounded(run_id: str, task: str, tool_calls: int, mcp_tools: list[dict]) -> dict:
    async with gate:
        return await asyncio.wait_for(
            run_searcher(run_id, task, tool_calls, mcp_tools), LIMITS.searcher_timeout_s
        )


async def research(run_id: str, brief: dict, mcp_tools: list[dict]) -> list[str]:
    effort = plan_for(brief["complexity"])
    notes: list[str] = []
    for round_no in range(1, LIMITS.max_researcher_iterations + 1):
        plan = await plan_round(run_id, brief, notes)
        if round_no == 1:
            save_plan(run_id, plan)
        if plan.get("complete") or not plan.get("tasks"):
            break
        tasks = plan["tasks"][: effort.subagents]
        results = await asyncio.gather(
            *(bounded(run_id, t, effort.tool_calls, mcp_tools) for t in tasks),
            return_exceptions=True,
        )
        notes += [r["findings"] for r in results if isinstance(r, dict)]
        checkpoint(run_id, f"round-{round_no}", {"notes": notes})
    return notes
