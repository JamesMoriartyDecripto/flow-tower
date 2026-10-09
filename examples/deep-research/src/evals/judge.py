"""Offline eval: LLM-as-judge over a small set of real queries.

Start small (about 20 queries drawn from real usage): early prompt changes move
scores a lot, so a big suite is not needed to see them. One judge call per run
returns 0.0-1.0 per criterion plus pass/fail, judged on the end state.
"""
import asyncio
import json
import statistics
import sys
from pathlib import Path

from anthropic import AsyncAnthropic

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import MODELS  # noqa: E402
from prompt_templates import render  # noqa: E402
from research_pipeline import run  # noqa: E402

client = AsyncAnthropic()
QUERIES = Path(__file__).resolve().parents[2] / "evals" / "queries.jsonl"


async def judge(query: str, report: str, sources: str) -> dict:
    response = await client.messages.create(
        model=MODELS["judge"],
        max_tokens=4096,
        system=render("judge", query=query, report="(see user message)", sources=sources),
        messages=[{"role": "user", "content": report}],
    )
    return json.loads("".join(b.text for b in response.content if b.type == "text"))


async def main() -> None:
    rows = [json.loads(line) for line in QUERIES.read_text().splitlines() if line.strip()]
    grades = []
    for row in rows:
        result = await run([{"role": "user", "content": row["query"]}], mcp_tools=[])
        if result["status"] == "needs_input":
            continue
        grades.append(await judge(row["query"], result["report"], ""))
    for criterion in ("factual_accuracy", "citation_accuracy", "completeness",
                      "source_quality", "tool_efficiency"):
        print(f"{criterion:18} {statistics.mean(g['scores'][criterion] for g in grades):.2f}")
    print(f"pass rate          {sum(g['pass'] for g in grades) / len(grades):.0%}")


if __name__ == "__main__":
    asyncio.run(main())
