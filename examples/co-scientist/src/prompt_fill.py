"""Fill prompts/*.md templates. Structured values are inlined as YAML."""
import re
from functools import cache
from pathlib import Path

import yaml

PROMPTS = Path(__file__).resolve().parent.parent / "prompts"
VAR = re.compile(r"\{\{(\w+)\}\}")


@cache
def _load(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text()


def _text(value: object) -> str:
    return value if isinstance(value, str) else yaml.safe_dump(value, sort_keys=False).strip()


def fill(name: str, **values: object) -> str:
    return VAR.sub(lambda m: _text(values[m.group(1)]) if m.group(1) in values else m.group(0), _load(name))
