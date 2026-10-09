"""Six peer agents with decentralized handoffs (abridged from openai-cs-agents-demo).

Instructions live in ../prompts/*.md here; upstream builds them as f-strings so the
current confirmation, flight and seat from the shared context are injected per turn.
"""
from agents import Agent, RunContextWrapper, handoff
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX

from .context import AirlineAgentChatContext
from .demo_data import apply_itinerary_defaults
from .guardrails import jailbreak_guardrail, relevance_guardrail
from .prompts import render
from .tools import (
    assign_special_service_seat, book_new_flight, cancel_flight, display_seat_map,
    faq_lookup_tool, flight_status_tool, get_matching_flights, get_trip_details,
    issue_compensation, update_seat,
)

MODEL = "gpt-5.2"
GUARDS = [relevance_guardrail, jailbreak_guardrail]  # every agent runs both input guardrails


def _agent(name: str, prompt: str, desc: str, tools: list) -> Agent[AirlineAgentChatContext]:
    return Agent[AirlineAgentChatContext](
        name=name, model=MODEL, handoff_description=desc, tools=tools,
        instructions=lambda ctx, agent: RECOMMENDED_PROMPT_PREFIX + "\n" + render(prompt, ctx.context.state),
        input_guardrails=GUARDS,
    )


triage_agent = _agent("Triage Agent", "triage",
    "Delegates requests to the right specialist agent.", [get_trip_details])
flight_information_agent = _agent("Flight Information Agent", "flight-information",
    "Provides flight status, connection impact, and alternate options.",
    [flight_status_tool, get_matching_flights])
booking_cancellation_agent = _agent("Booking and Cancellation Agent", "booking-cancellation",
    "Handles new bookings, rebookings after delays, and cancellations.",
    [cancel_flight, get_matching_flights, book_new_flight])
seat_special_services_agent = _agent("Seat and Special Services Agent", "seat-services",
    "Updates seats and handles medical or special service seating.",
    [update_seat, assign_special_service_seat, display_seat_map])
faq_agent = _agent("FAQ Agent", "faq",
    "Answers common questions about policies, baggage, seats, and compensation.", [faq_lookup_tool])
refunds_compensation_agent = _agent("Refunds and Compensation Agent", "refunds-compensation",
    "Opens compensation cases and issues hotel/meal support after delays.",
    [issue_compensation, faq_lookup_tool])


async def on_booking_handoff(ctx: RunContextWrapper[AirlineAgentChatContext]) -> None:
    """Hydrate confirmation + flight before the booking agent's first turn."""
    apply_itinerary_defaults(ctx.context.state)


async def on_seat_booking_handoff(ctx: RunContextWrapper[AirlineAgentChatContext]) -> None:
    apply_itinerary_defaults(ctx.context.state)


to_booking = handoff(agent=booking_cancellation_agent, on_handoff=on_booking_handoff)
to_seats = handoff(agent=seat_special_services_agent, on_handoff=on_seat_booking_handoff)

# Peers, not a hierarchy: any specialist can hand off sideways or back to triage.
triage_agent.handoffs = [flight_information_agent, to_booking, to_seats, faq_agent,
                         refunds_compensation_agent]
faq_agent.handoffs = [triage_agent]
seat_special_services_agent.handoffs = [refunds_compensation_agent, triage_agent]
flight_information_agent.handoffs = [to_booking, triage_agent]
booking_cancellation_agent.handoffs = [to_seats, refunds_compensation_agent, triage_agent]
refunds_compensation_agent.handoffs = [faq_agent, triage_agent]
