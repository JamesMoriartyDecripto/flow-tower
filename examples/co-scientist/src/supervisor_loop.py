"""Supervisor + asynchronous worker pool.

The supervisor turns statistics into agent weights, fills the task queue, and
checks for a terminal state. Workers pull tasks and run one specialised agent
each, so compute scales by adding workers. State is snapshotted every cycle.
"""
import asyncio
import random

import yaml

from context_memory import save
from cosci_llm import ask
from prompt_fill import fill
from specialists import AGENTS

CFG = yaml.safe_load(open("config/agent_weights.yaml"))


def stats(state: dict) -> dict:
    ratings = sorted(state["ratings"].values(), reverse=True)
    return {
        "hypotheses": len(state["hypotheses"]),
        "in_tournament": len(ratings),
        "top_elo": ratings[:5],
        "matches": sum(state["matches"].values()) // 2,
        "scientist_inbox": len(state["scientist_inbox"]),
    }


async def worker(queue: asyncio.Queue, state: dict) -> None:
    while True:
        agent, payload = await queue.get()
        try:
            await asyncio.wait_for(AGENTS[agent](state, payload), CFG["task_timeout_s"])
        except Exception as err:  # one failed task never stops the run
            state.setdefault("errors", []).append(f"{agent}: {err}")
        finally:
            queue.task_done()


async def run(run_id: str, state: dict) -> dict:
    queue: asyncio.Queue = asyncio.Queue(maxsize=CFG["queue_size"])
    pool = [asyncio.create_task(worker(queue, state)) for _ in range(CFG["workers"])]
    while state["cycle"] < CFG["max_cycles"]:
        state["cycle"] += 1
        plan = await ask(fill("supervisor", research_plan=state["plan"], stats=stats(state),
                              batch_size=CFG["batch_size"], stable_cycles=CFG["stable_cycles"],
                              meta_review_every=CFG["meta_review_every"]))
        if plan["terminal"]:
            break
        while state["scientist_inbox"]:  # scientist input goes first
            task = state["scientist_inbox"].pop(0)
            await queue.put((task["agent"], task))
        agents, weights = zip(*plan["weights"].items())
        for agent in random.choices(agents, weights=weights, k=CFG["batch_size"]):
            await queue.put((agent, {}))
        await queue.join()
        save(run_id, state)
    for task in pool:
        task.cancel()
    return state
