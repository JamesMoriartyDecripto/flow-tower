"""Mock itineraries and FAQ answers. A real deployment reads the reservation system instead."""
from copy import deepcopy

from .context import AirlineAgentContext

MOCK_ITINERARIES = {
    "disrupted": {
        "passenger_name": "Morgan Lee", "confirmation_number": "IR-D204", "seat_number": "14C",
        "segments": [
            {"flight_number": "PA441", "origin": "Paris (CDG)", "destination": "New York (JFK)",
             "status": "Delayed 5 hours due to weather, expected departure 19:55", "gate": "B18"},
            {"flight_number": "NY802", "origin": "New York (JFK)", "destination": "Austin (AUS)",
             "status": "Connection missed because of first leg delay", "gate": "C7"},
        ],
        "rebook_options": [
            {"flight_number": "NY950", "origin": "New York (JFK)", "destination": "Austin (AUS)",
             "departure": "2024-12-10 09:45", "seat": "2A (front row)"},
            {"flight_number": "NY982", "origin": "New York (JFK)", "destination": "Austin (AUS)",
             "departure": "2024-12-10 13:20", "seat": "3C"},
        ],
        "vouchers": {
            "hotel": "Overnight hotel covered up to $180 near JFK Terminal 5 partner hotel",
            "meal": "$60 meal credit for the delay",
            "ground": "$40 ground transport credit to the hotel",
        },
    },
    "on_time": {
        "passenger_name": "Taylor Lee", "confirmation_number": "LL0EZ6", "seat_number": "23A",
        "segments": [{"flight_number": "FLT-123", "origin": "San Francisco (SFO)",
                      "destination": "Los Angeles (LAX)", "status": "On time", "gate": "A10"}],
        "rebook_options": [], "vouchers": {},
    },
}

FAQ = [
    (("bag",), "One carry-on under 50 pounds and 22 x 14 x 9 inches. Missing bags: file a claim."),
    (("compensation", "delay", "voucher"),
     "Delays over 3 hours or missed connections: hotel and meal vouchers plus a compensation case."),
    (("seats", "plane"), "120 seats: 22 business, 98 economy. Exit rows 4 and 16. Rows 5-8 Economy Plus."),
    (("wifi",), "We have free wifi on the plane, join Airline-Wifi"),
]


def apply_itinerary_defaults(ctx: AirlineAgentContext, scenario_key: str | None = None) -> None:
    key = scenario_key or ctx.scenario or "disrupted"
    data = MOCK_ITINERARIES[key]
    ctx.scenario = key
    ctx.passenger_name = ctx.passenger_name or data["passenger_name"]
    ctx.confirmation_number = ctx.confirmation_number or data["confirmation_number"]
    ctx.seat_number = ctx.seat_number or data["seat_number"]
    ctx.flight_number = ctx.flight_number or data["segments"][0]["flight_number"]
    ctx.itinerary = ctx.itinerary or deepcopy(data["segments"])


def get_itinerary_for_flight(flight_number: str | None) -> tuple[str, dict] | None:
    for key, it in MOCK_ITINERARIES.items():
        flights = {s["flight_number"].lower() for s in it["segments"] + it["rebook_options"]}
        if flight_number and flight_number.lower() in flights:
            return key, it
    return None


def active_itinerary(ctx: AirlineAgentContext) -> tuple[str, dict]:
    if ctx.scenario in MOCK_ITINERARIES:
        return ctx.scenario, MOCK_ITINERARIES[ctx.scenario]
    match = get_itinerary_for_flight(ctx.flight_number)
    ctx.scenario = match[0] if match else "disrupted"
    return ctx.scenario, MOCK_ITINERARIES[ctx.scenario]
