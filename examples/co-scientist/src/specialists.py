"""The six specialised agents, each a worker task over the shared state."""
import random
import uuid

from cosci_llm import ask
from elo_tournament import INITIAL_ELO, match_format, parse_winner, pick_pair, update
from prompt_fill import fill
from proximity_graph import add_hypothesis

GEN_METHODS = ["literature", "debate", "assumptions", "expansion"]
REVIEWS = ["full", "deep_verification", "observation", "simulation"]
EVOLVE = ["grounding", "feasibility", "inspiration", "combination", "simplification", "out_of_box"]


def top(state: dict, n: int = 5) -> list[dict]:
    ids = sorted(state["ratings"], key=state["ratings"].get, reverse=True)[:n]
    return [{"id": h, **state["hypotheses"][h], "reviews": state["reviews"].get(h, [])} for h in ids]


async def admit(state: dict, hyp: dict) -> None:  # safety + initial review, then 1200 Elo
    if not (await ask(fill("safety", kind="hypothesis", text=hyp["text"])))["allowed"]:
        return
    review = await ask(fill("reflection", research_plan=state["plan"], hypothesis=hyp, review_type="initial"))
    if review["verdict"] == "reject":
        return
    hid = uuid.uuid4().hex[:8]
    state["hypotheses"][hid], state["reviews"][hid] = hyp, [review]
    if await add_hypothesis(state, hid, hyp["text"], fill) is None:  # not a duplicate
        state["ratings"][hid] = INITIAL_ELO


async def generation(state: dict, task: dict) -> None:
    if task.get("method") == "scientist":  # the scientist's own idea, same gates
        return await admit(state, {"text": task["text"], "source": "scientist"})
    method = task.get("method") or random.choice(GEN_METHODS)
    out = await ask(fill("generation", research_plan=state["plan"], method=method,
                         meta_feedback=state["meta_feedback"], top_hypotheses=top(state)), search=True)
    for hyp in (out if isinstance(out, list) else [out]):
        await admit(state, hyp)


async def reflection(state: dict, task: dict) -> None:
    hid = task.get("id") or random.choice(list(state["ratings"]))
    review = await ask(fill("reflection", research_plan=state["plan"], hypothesis=state["hypotheses"][hid],
                            review_type=random.choice(REVIEWS)), search=True)
    state["reviews"].setdefault(hid, []).append(review)


async def ranking(state: dict, task: dict) -> None:
    a, b = pick_pair(state["ratings"], state["matches"], state["similarity"])
    r = state["ratings"]
    judgement = await ask(fill("ranking", research_plan=state["plan"], format=match_format(r, a, b), max_turns=4,
                               hypothesis_a=state["hypotheses"][a], elo_a=round(r[a]), reviews_a=state["reviews"][a],
                               hypothesis_b=state["hypotheses"][b], elo_b=round(r[b]), reviews_b=state["reviews"][b]),
                          as_json=False)
    winner, loser = (a, b) if parse_winner(judgement) == "A" else (b, a)
    update(r, winner, loser)
    state["matches"].update({h: state["matches"].get(h, 0) + 1 for h in (a, b)})
    state.setdefault("debates", []).append(judgement[-600:])


async def evolution(state: dict, task: dict) -> None:
    out = await ask(fill("evolution", research_plan=state["plan"], top_hypotheses=top(state),
                         strategy=random.choice(EVOLVE)), search=True)
    await admit(state, out)  # a new hypothesis; the originals stay untouched


async def proximity(state: dict, task: dict) -> None:  # also runs inline in admit()
    for hid in random.sample(list(state["ratings"]), k=min(3, len(state["ratings"]))):
        await add_hypothesis(state, hid, state["hypotheses"][hid]["text"], fill)


async def meta_review(state: dict, task: dict) -> None:
    out = await ask(fill("meta-review", research_plan=state["plan"], reviews=state["reviews"],
                         debates=state.get("debates", [])[-50:], top_hypotheses=top(state, 10)), as_json=False)
    state["meta_feedback"] = out.split("## 2.")[0][-4000:]
    state["overview"] = out


AGENTS = {"generation": generation, "reflection": reflection, "ranking": ranking,
          "evolution": evolution, "proximity": proximity, "meta_review": meta_review}
