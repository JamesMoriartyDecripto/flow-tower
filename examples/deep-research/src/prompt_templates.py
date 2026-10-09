"""Load prompts/*.md and fill {{var}} placeholders.

Unknown placeholders are left in place on purpose: the citation agent prompt
uses {{unsupported}} as a literal marker.
"""
import re
from datetime import date
from functools import cache
from pathlib import Path

PROMPTS = Path(__file__).resolve().parent.parent / "prompts"
VAR = re.compile(r"\{\{(\w+)\}\}")


@cache
def _load(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text()


def render(name: str, **values: object) -> str:
    values.setdefault("date", date.today().isoformat())
    return VAR.sub(lambda m: str(values.get(m.group(1), m.group(0))), _load(name))
