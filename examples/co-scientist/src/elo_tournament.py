"""Elo tournament over hypotheses.

New hypotheses start at 1200. Top-ranked ones meet in multi-turn debates;
the rest get single-turn pairwise comparisons. Pairing prefers similar
hypotheses (proximity graph), new hypotheses and the top of the table.
"""
import random

INITIAL_ELO = 1200
K = 32
TOP_N_DEBATE = 10


def expected(a: float, b: float) -> float:
    return 1 / (1 + 10 ** ((b - a) / 400))


def update(ratings: dict[str, float], winner: str, loser: str) -> None:
    e = expected(ratings[winner], ratings[loser])
    ratings[winner] += K * (1 - e)
    ratings[loser] -= K * (1 - e)


def match_format(ratings: dict[str, float], a: str, b: str) -> str:
    top = sorted(ratings, key=ratings.get, reverse=True)[:TOP_N_DEBATE]
    return "debate" if a in top and b in top else "single_turn"


def pick_pair(ratings: dict[str, float], matches: dict[str, int],
              similarity: dict[tuple[str, str], float]) -> tuple[str, str]:
    """Weighted pick: few matches played, high rating, and a similar opponent."""
    ids = list(ratings)
    weight = {h: 1 / (1 + matches.get(h, 0)) + ratings[h] / 4000 for h in ids}
    a = random.choices(ids, weights=[weight[h] for h in ids])[0]
    others = [h for h in ids if h != a]
    near = [similarity.get(tuple(sorted((a, h))), 0.1) for h in others]
    b = random.choices(others, weights=near)[0]
    return a, b


def parse_winner(judgement: str) -> str:
    """The ranking prompt ends with 'better hypothesis: A' or '... B'."""
    last = judgement.strip().splitlines()[-1].lower()
    if "better hypothesis:" not in last:
        raise ValueError("judge did not name a winner")
    return "A" if last.endswith("a") else "B"
