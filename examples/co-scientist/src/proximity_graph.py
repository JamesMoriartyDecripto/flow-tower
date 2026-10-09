"""Proximity graph: similarity edges between hypotheses.

Embeddings shortlist neighbours cheaply; the Proximity agent then judges
similarity with respect to the research goal (same mechanism, target or
experiment) and flags duplicates. The graph feeds tournament pairing,
clustering in the research overview and de-duplication.
"""
import math

from cosci_llm import ask, embed

SHORTLIST = 8
DUPLICATE = 0.9


def cosine(u: list[float], v: list[float]) -> float:
    dot = sum(a * b for a, b in zip(u, v))
    return dot / (math.sqrt(sum(a * a for a in u)) * math.sqrt(sum(b * b for b in v)))


async def add_hypothesis(state: dict, hid: str, text: str, prompt_for) -> str | None:
    """Insert one hypothesis; return the id it duplicates, if any."""
    [vector] = await embed([text])
    state["vectors"][hid] = vector
    scored = sorted(
        ((cosine(vector, v), other) for other, v in state["vectors"].items() if other != hid),
        reverse=True,
    )[:SHORTLIST]
    if not scored:
        return None
    neighbours = [{"id": o, "text": state["hypotheses"][o]["text"]} for _, o in scored]
    verdict = await ask(prompt_for("proximity", hypothesis=text, neighbours=neighbours))
    for edge in verdict["edges"]:
        state["similarity"][tuple(sorted((hid, edge["id"])))] = edge["similarity"]
    state["hypotheses"][hid]["cluster"] = verdict["cluster"]
    dup = verdict.get("duplicate_of")
    if dup and state["similarity"].get(tuple(sorted((hid, dup))), 0) >= DUPLICATE:
        return dup
    return None
