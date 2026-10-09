"""Function tools (abridged). Each mutates the shared context; outputs are plain strings."""
import random
import string

from agents import RunContextWrapper, function_tool
from chatkit.types import ProgressUpdateEvent

from .context import AirlineAgentChatContext as Ctx
from .demo_data import FAQ, active_itinerary, apply_itinerary_defaults, get_itinerary_for_flight
from .services import assign_special_service_seat, display_seat_map, issue_compensation, update_seat

__all__ = ["assign_special_service_seat", "display_seat_map", "issue_compensation", "update_seat"]


def _confirmation(state) -> str:
    state.confirmation_number = state.confirmation_number or "".join(
        random.choices(string.ascii_uppercase + string.digits, k=6))
    return state.confirmation_number


@function_tool(name_override="faq_lookup_tool", description_override="Lookup frequently asked questions.")
async def faq_lookup_tool(question: str) -> str:
    q = question.lower()
    for keys, answer in FAQ:
        if any(k in q for k in keys):
            return answer
    return "I'm sorry, I don't know the answer to that question."


@function_tool(name_override="get_trip_details",
               description_override="Infer the disrupted Paris->New York->Austin trip and hydrate context.")
async def get_trip_details(context: RunContextWrapper[Ctx], message: str) -> str:
    disrupted = any(k in message.lower() for k in ("paris", "new york", "austin"))
    apply_itinerary_defaults(context.context.state, "disrupted" if disrupted else "on_time")
    s = context.context.state
    return f"Hydrated itinerary: flight {s.flight_number}, confirmation {s.confirmation_number}"


@function_tool(name_override="flight_status_tool", description_override="Lookup status for a flight.")
async def flight_status_tool(context: RunContextWrapper[Ctx], flight_number: str) -> str:
    await context.context.stream(ProgressUpdateEvent(text=f"Checking status for {flight_number}..."))
    match = get_itinerary_for_flight(flight_number)
    if match:
        seg = next((s for s in match[1]["segments"] if s["flight_number"] == flight_number), None)
        if seg:
            return f"Flight {flight_number} | Status: {seg['status']} | Gate: {seg['gate']}"
    return f"Flight {flight_number} is on time and scheduled to depart at gate A10."


@function_tool(name_override="get_matching_flights",
               description_override="Find replacement flights when a segment is delayed or cancelled.")
async def get_matching_flights(context: RunContextWrapper[Ctx], origin: str | None = None,
                               destination: str | None = None) -> str:
    _, itinerary = active_itinerary(context.context.state)
    options = itinerary.get("rebook_options", [])
    if not options:
        return "All flights are operating on time. No alternate flights are needed."
    return "Matching flights:\n" + "\n".join(
        f"{o['flight_number']} {o['origin']} -> {o['destination']} dep {o['departure']}" for o in options)


@function_tool(name_override="book_new_flight",
               description_override="Book a new or replacement flight and auto-assign a seat.")
async def book_new_flight(context: RunContextWrapper[Ctx], flight_number: str | None = None) -> str:
    state = context.context.state
    _, itinerary = active_itinerary(state)
    options = itinerary.get("rebook_options", [])
    pick = next((o for o in options if o["flight_number"] == flight_number), options[0] if options else None)
    if pick:
        state.flight_number, state.seat_number = pick["flight_number"], pick.get("seat", "auto-assign")
    return f"Rebooked to {state.flight_number}. Seat {state.seat_number}. Confirmation {_confirmation(state)}."


@function_tool(name_override="cancel_flight", description_override="Cancel a flight.")
async def cancel_flight(context: RunContextWrapper[Ctx]) -> str:
    state = context.context.state
    apply_itinerary_defaults(state)
    return f"Flight {state.flight_number} successfully cancelled for confirmation {_confirmation(state)}"
