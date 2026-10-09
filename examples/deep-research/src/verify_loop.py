"""Verifier loop: a fresh-context auditor checks the cited report.

Blocking issues go back to the writer at most LIMITS.max_verify_rounds times;
after that the report ships with its open issues listed for the user.
"""
import json

from anthropic import AsyncAnthropic

from cite import add_citations
from config import LIMITS, MODELS
from plan_store import checkpoint
from prompt_templates import render

client = AsyncAnthropic()


async def audit(brief: dict, report: str) -> dict:
    response = await client.messages.create(
        model=MODELS["verifier"],
        max_tokens=8192,
        system=render("verifier", report="(see user message)", brief=brief["brief"]),
        messages=[{"role": "user", "content": report}],
    )
    return json.loads("".join(b.text for b in response.content if b.type == "text"))


async def revise(brief: dict, findings: str, report: str, issues: list[dict]) -> str:
    response = await client.messages.create(
        model=MODELS["writer"],
        max_tokens=32000,
        system=render("writer", brief=brief["brief"], findings=findings, issues=json.dumps(issues)),
        messages=[{"role": "user", "content": report}],
    )
    return "".join(b.text for b in response.content if b.type == "text")


async def verify(run_id: str, brief: dict, report: str, findings: str, sources: list[dict]):
    for round_no in range(1, LIMITS.max_verify_rounds + 1):
        verdict = await audit(brief, report)
        checkpoint(run_id, f"verify-{round_no}", verdict)
        blocking = [i for i in verdict["issues"] if i["severity"] == "blocking"]
        if verdict["verified"] or not blocking:
            return report, []
        report = await add_citations(await revise(brief, findings, report, blocking), sources)
    return report, blocking
