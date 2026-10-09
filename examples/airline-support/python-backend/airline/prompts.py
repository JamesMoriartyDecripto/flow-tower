"""Loads ../prompts/<name>.md and fills {{confirmation}}, {{flight}}, {{seat}}, {{case_id}}."""
from functools import lru_cache
from pathlib import Path

from .context import AirlineAgentContext

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"


@lru_cache
def _template(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


def render(name: str, ctx: AirlineAgentContext) -> str:
    values = {
        "confirmation": ctx.confirmation_number or "[unknown]",
        "flight": ctx.flight_number or "[unknown]",
        "seat": ctx.seat_number or "[unassigned]",
        "case_id": ctx.compensation_case_id or "[not opened]",
    }
    text = _template(name)
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text
