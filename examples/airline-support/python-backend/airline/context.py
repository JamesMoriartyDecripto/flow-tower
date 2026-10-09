from __future__ import annotations

from chatkit.agents import AgentContext
from pydantic import BaseModel


class AirlineAgentContext(BaseModel):
    """Shared state every agent reads and every tool mutates. Contains passenger PII."""

    passenger_name: str | None = None
    confirmation_number: str | None = None
    seat_number: str | None = None
    flight_number: str | None = None
    account_number: str | None = None
    itinerary: list[dict[str, str]] | None = None   # internal only
    baggage_claim_id: str | None = None             # internal only
    compensation_case_id: str | None = None
    scenario: str | None = None
    vouchers: list[str] | None = None
    special_service_note: str | None = None
    origin: str | None = None
    destination: str | None = None


class AirlineAgentChatContext(AgentContext[dict]):
    """ChatKit run context; the persisted AirlineAgentContext lives in `state`."""

    state: AirlineAgentContext


def create_initial_context() -> AirlineAgentContext:
    return AirlineAgentContext()


HIDDEN = {"itinerary", "baggage_claim_id", "compensation_case_id", "scenario"}


def public_context(ctx: AirlineAgentContext) -> dict:
    """Filtered view for the UI: internal fields never leave the server."""
    data = {k: v for k, v in ctx.model_dump().items() if k not in HIDDEN}
    if not data.get("vouchers"):
        data.pop("vouchers", None)  # only surface vouchers once granted
    return data
