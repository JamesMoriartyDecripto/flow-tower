"""Run configuration: models per role, effort scaling and hard limits.

Defaults mirror open_deep_research (max 5 concurrent units, 6 supervisor rounds,
10 tool calls per researcher) and the effort rules from Anthropic's multi-agent
research system (1 agent for facts, 2-4 for comparisons, 10+ for complex work).
"""
from dataclasses import dataclass, field

MODELS = {
    "clarify": "claude-sonnet-5-5",
    "brief": "claude-sonnet-5-5",
    "lead": "claude-opus-5-5",
    "searcher": "claude-sonnet-5-5",
    "summarize": "claude-haiku-5-5",   # condenses fetched pages before they hit context
    "compress": "claude-sonnet-5-5",
    "writer": "claude-opus-5-5",
    "citations": "claude-sonnet-5-5",
    "verifier": "claude-sonnet-5-5",
    "judge": "claude-opus-5-5",
}

# Effort per role. Opus 5.5 defaults to medium, so set it explicitly.
EFFORT = {"lead": "high", "writer": "high", "searcher": "medium", "summarize": "low"}

WEB_SEARCH = {"type": "web_search_20260209", "name": "web_search"}
WEB_FETCH = {"type": "web_fetch_20260209", "name": "web_fetch"}


@dataclass(frozen=True)
class Effort:
    subagents: int
    tool_calls: int


EFFORT_SCALING = {
    "simple": Effort(subagents=1, tool_calls=10),
    "comparison": Effort(subagents=4, tool_calls=15),
    "complex": Effort(subagents=10, tool_calls=20),
}


@dataclass(frozen=True)
class Limits:
    allow_clarification: bool = True
    max_concurrent_research_units: int = 5
    max_researcher_iterations: int = 6      # lead reflect-and-dispatch rounds
    max_react_tool_calls: int = 10          # per searcher, overridden by EFFORT_SCALING
    max_verify_rounds: int = 2
    max_content_chars: int = 50_000         # page text above this is summarised first
    run_budget_usd: float = 12.0
    searcher_timeout_s: int = 600
    allowed_mcp: list[str] = field(default_factory=lambda: ["gdrive", "confluence"])


LIMITS = Limits()


def plan_for(complexity: str) -> Effort:
    """Effort for a query class; never above the concurrency cap."""
    effort = EFFORT_SCALING.get(complexity, EFFORT_SCALING["comparison"])
    return Effort(min(effort.subagents, LIMITS.max_concurrent_research_units * 2), effort.tool_calls)
