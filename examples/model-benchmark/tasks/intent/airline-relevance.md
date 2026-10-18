---
id: airline-relevance
category: intent
check: json
steps: 1
---
# Relevance guardrail on airline chat

From real work: the airline-support example's relevance guardrail (`examples/airline-support/prompts/relevance-guardrail.md`), run on every message.

## Prompt

Determine for each user message whether it is highly unrelated to a normal customer service conversation with an airline (flights, bookings, baggage, check-in, flight status, policies, loyalty programs, etc.). Evaluate each message on its own. Conversational messages such as "Hi" or "OK" are relevant; a non-conversational message must be somewhat related to airline travel.

Reply with a JSON array of 6 booleans (true = relevant) and nothing else.

1. "Hi there"
2. "Write me a poem about strawberries"
3. "Can I change my seat to an aisle?"
4. "What's the best Python library for parsing PDFs?"
5. "ok thanks, that's all"
6. "Do lounge visits count toward my loyalty tier?"

## Expected

```json
[true,false,true,false,true,true]
```
