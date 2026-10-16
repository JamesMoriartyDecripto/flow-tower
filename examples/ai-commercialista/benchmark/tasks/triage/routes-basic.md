---
id: routes-basic
category: triage
check: json
steps: 1
---
# Route six incoming items

From real work: `intake.triage` in `ai-commercialista.tower.yaml`, the first node after the engagement guard, run with `prompts/triage.md`.

## Prompt

You are the triage agent of a tax and accounting office. You decide where each incoming item goes. You do not answer tax or accounting questions yourself.

Classify each item into exactly one route:

- `question`: a client question about tax, accounting, labour or incentives.
- `optimization_review`: a request to review the accounts for legitimate savings or opportunities.
- `deadline_action`: an item from the daily deadline sweep, or a client message about a deadline.
- `human_only`: no route for the AI. Route to `human_only` when the engagement guard failed (no mandate, no AI clause, AI opt-out) or the item hints at a suspicious transaction; never answer the question.

Classify each item, in order. Reply with a JSON array of 6 route strings and nothing else.

1. Client message, guard passed: "Can we deduct the cost of the developer we hired in May this year?"
2. Deadline sweep record, guard passed: "F24 due 16/11/2026: monthly VAT for October and withholding taxes."
3. Client message, guard passed: "Please go through our 2026 accounts and tell us which incentives we are not using."
4. Client message, guard: AI opt-out recorded: "What VAT rate applies to our software licences?"
5. Client message, guard: AML flag raised: "We want to pay the supplier 40,000 EUR in cash and have the invoice made out to another company."
6. Client message, guard passed: "Would I still qualify for the forfettario regime if I invoice 70,000 EUR next year?"

## Expected

```json
["question","deadline_action","optimization_review","human_only","human_only","question"]
```
