"""Seat and compensation tools (split out of tools.py to keep files short)."""
import random

from agents import RunContextWrapper, function_tool
from agents.decorators import tool
from chatkit.types import ProgressUpdateEvent

from .approvals import compensation_needs_approval
from .context import AirlineAgentChatContext as Ctx
from .demo_data import active_itinerary, apply_itinerary_defaults


@function_tool
async def update_seat(context: RunContextWrapper[Ctx], confirmation_number: str, new_seat: str) -> str:
    """Update the seat for a given confirmation number."""
    state = context.context.state
    apply_itinerary_defaults(state)
    state.confirmation_number, state.seat_number = confirmation_number, new_seat
    return f"Updated seat to {new_seat} for confirmation number {confirmation_number}"


@function_tool(name_override="assign_special_service_seat",
               description_override="Assign front row or special service seating for medical needs.")
async def assign_special_service_seat(context: RunContextWrapper[Ctx],
                                      seat_request: str = "front row for medical needs") -> str:
    state = context.context.state
    apply_itinerary_defaults(state)
    state.seat_number = "1A" if "front" in seat_request.lower() else "2A"
    state.special_service_note = seat_request
    return f"Secured {seat_request} seat {state.seat_number} on flight {state.flight_number}."


@function_tool(name_override="display_seat_map",
               description_override="Display an interactive seat map so the customer can choose a seat.")
async def display_seat_map(context: RunContextWrapper[Ctx]) -> str:
    return "DISPLAY_SEAT_MAP"  # the UI intercepts this string and opens the seat selector


# Upstream uses @function_tool with no approval. Production adds a per-call approval policy:
# the run pauses (result.interruptions) when the payout crosses the threshold.
@tool(needs_approval=compensation_needs_approval)
async def issue_compensation(context: RunContextWrapper[Ctx],
                             reason: str = "Delay causing missed connection") -> str:
    """Create a compensation case and issue hotel/meal vouchers."""
    await context.context.stream(ProgressUpdateEvent(text="Opening compensation case..."))
    state = context.context.state
    _, itinerary = active_itinerary(state)
    state.compensation_case_id = state.compensation_case_id or f"CMP-{random.randint(1000, 9999)}"
    state.vouchers = list(itinerary.get("vouchers", {}).values())
    return (f"Opened compensation case {state.compensation_case_id} for: {reason}. "
            f"Issued: {'; '.join(state.vouchers) or 'no vouchers'}. Keep receipts.")
