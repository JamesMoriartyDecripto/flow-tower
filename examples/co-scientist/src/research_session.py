"""One co-scientist session: goal -> safety -> plan config -> scientist approval -> loop.

Long-running and asynchronous: the scientist can leave and come back. Their
reviews, own hypotheses and chat messages land in the inbox and are scheduled
first by the supervisor. A crashed session restarts from context memory.
"""
import asyncio
import sys
import uuid

import yaml

from context_memory import empty_state, restore
from cosci_llm import ask
from prompt_fill import fill
from supervisor_loop import run


async def start(goal: str, attachments: str, approve) -> dict:
    """`approve` shows the parsed plan to the scientist and returns it (possibly edited) or None."""
    check = await ask(fill("safety", kind="research goal", text=goal))
    if not check["allowed"]:
        return {"status": "rejected", "reason": check["reason"]}
    plan = yaml.safe_load(await ask(fill("goal-parser", goal=goal, attachments=attachments), as_json=False))
    plan = await approve(plan)
    if plan is None:
        return {"status": "cancelled"}
    run_id = uuid.uuid4().hex[:10]
    state = await run(run_id, empty_state(plan))
    return {"status": "done", "run_id": run_id, "overview": state.get("overview")}


async def resume(run_id: str) -> dict:
    state = restore(run_id)
    if state is None:
        raise SystemExit(f"no snapshot for {run_id}")
    state = await run(run_id, state)
    return {"status": "done", "run_id": run_id, "overview": state.get("overview")}


def add_scientist_hypothesis(state: dict, text: str) -> None:
    """Scientist ideas compete in the same tournament as generated ones."""
    state["scientist_inbox"].append({"agent": "generation", "method": "scientist", "text": text})


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--resume":
        print(asyncio.run(resume(sys.argv[2]))["status"])
    else:
        plan = yaml.safe_load(open("config/research_plan.yaml"))

        async def auto_approve(_: dict) -> dict:
            return plan  # CLI demo: the reviewed config on disk is the approval

        print(asyncio.run(start(plan["goal"], "", auto_approve))["status"])
