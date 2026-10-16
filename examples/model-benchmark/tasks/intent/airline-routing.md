---
id: airline-routing
category: intent
check: json
steps: 1
---
# Route airline customer messages

From real work: the airline-support example's triage agent (`examples/airline-support/prompts/triage.md`) and its five specialist handoffs (`python-backend/airline/agents.py`).

## Prompt

You are a triaging agent for an airline. Route each customer message to the best specialist:
- `flight_information`: flight status, connection impact, alternate options
- `booking_cancellation`: new bookings, rebookings after delays, cancellations
- `seat_services`: seat changes, medical or special service seating
- `faq`: policy questions (baggage, seats, compensation rules, loyalty)
- `refunds_compensation`: opening compensation cases, hotel or meal support after a disruption

Classify each message, in order. Reply with a JSON array of 6 strings (the specialist ids) and nothing else.

1. "Is PA441 to Paris still leaving at 18:05? My app says delayed."
2. "My flight was delayed 5 hours and I missed the last train, can you cover a hotel tonight?"
3. "How many kilos can I bring in checked baggage on a basic fare?"
4. "Please cancel my return leg, confirmation LL0EZ6."
5. "I broke my leg last week and need a seat with more room for the cast."
6. "Given the delay, will I still make my connection in New York to Austin?"

## Expected

```json
["flight_information","refunds_compensation","faq","booking_cancellation","seat_services","flight_information"]
```
