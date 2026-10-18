---
id: triage-routes
category: decision
endpoint: decisions
check: json
steps: 1
---
# Route six client items (Decisions API)

From real work: `intake.triage` of the ai-commercialista example; the same six items as its chat task `routes-basic`, where all six chat models scored 6/6.

## Prompt

Route each item of the state to one of the four routes (the questions carry the routes and their definitions).

## Request

```json
{
 "state": {
  "context": "Triage for an AI accountant in an Italian studio. Route each item; never answer it.",
  "item1": "Client message, guard passed: \"Can we deduct the cost of the developer we hired in May this year?\"",
  "item2": "Deadline sweep record, guard passed: \"F24 due 16/11/2026: monthly VAT for October and withholding taxes.\"",
  "item3": "Client message, guard passed: \"Please go through our 2026 accounts and tell us which incentives we are not using.\"",
  "item4": "Client message, guard: AI opt-out recorded: \"What VAT rate applies to our software licences?\"",
  "item5": "Client message, guard: AML flag raised: \"We want to pay the supplier 40,000 EUR in cash and have the invoice made out to another company.\"",
  "item6": "Client message, guard passed: \"Would I still qualify for the forfettario regime if I invoice 70,000 EUR next year?\""
 },
 "questions": {
  "route1": {
   "type": "choice",
   "instructions": "Which route does `item1` take?",
   "criteria": {
    "question": "A client question about tax, accounting, labour or incentives.",
    "optimization_review": "A request to review the accounts for legitimate savings or opportunities.",
    "deadline_action": "An item from the daily deadline sweep, or a client message about a deadline.",
    "human_only": "No route for the AI: the engagement guard failed (no mandate, no AI clause, AI opt-out), an AML flag is raised, or the item hints at a suspicious transaction."
   }
  },
  "route2": {
   "type": "choice",
   "instructions": "Which route does `item2` take?",
   "criteria": {
    "question": "A client question about tax, accounting, labour or incentives.",
    "optimization_review": "A request to review the accounts for legitimate savings or opportunities.",
    "deadline_action": "An item from the daily deadline sweep, or a client message about a deadline.",
    "human_only": "No route for the AI: the engagement guard failed (no mandate, no AI clause, AI opt-out), an AML flag is raised, or the item hints at a suspicious transaction."
   }
  },
  "route3": {
   "type": "choice",
   "instructions": "Which route does `item3` take?",
   "criteria": {
    "question": "A client question about tax, accounting, labour or incentives.",
    "optimization_review": "A request to review the accounts for legitimate savings or opportunities.",
    "deadline_action": "An item from the daily deadline sweep, or a client message about a deadline.",
    "human_only": "No route for the AI: the engagement guard failed (no mandate, no AI clause, AI opt-out), an AML flag is raised, or the item hints at a suspicious transaction."
   }
  },
  "route4": {
   "type": "choice",
   "instructions": "Which route does `item4` take?",
   "criteria": {
    "question": "A client question about tax, accounting, labour or incentives.",
    "optimization_review": "A request to review the accounts for legitimate savings or opportunities.",
    "deadline_action": "An item from the daily deadline sweep, or a client message about a deadline.",
    "human_only": "No route for the AI: the engagement guard failed (no mandate, no AI clause, AI opt-out), an AML flag is raised, or the item hints at a suspicious transaction."
   }
  },
  "route5": {
   "type": "choice",
   "instructions": "Which route does `item5` take?",
   "criteria": {
    "question": "A client question about tax, accounting, labour or incentives.",
    "optimization_review": "A request to review the accounts for legitimate savings or opportunities.",
    "deadline_action": "An item from the daily deadline sweep, or a client message about a deadline.",
    "human_only": "No route for the AI: the engagement guard failed (no mandate, no AI clause, AI opt-out), an AML flag is raised, or the item hints at a suspicious transaction."
   }
  },
  "route6": {
   "type": "choice",
   "instructions": "Which route does `item6` take?",
   "criteria": {
    "question": "A client question about tax, accounting, labour or incentives.",
    "optimization_review": "A request to review the accounts for legitimate savings or opportunities.",
    "deadline_action": "An item from the daily deadline sweep, or a client message about a deadline.",
    "human_only": "No route for the AI: the engagement guard failed (no mandate, no AI clause, AI opt-out), an AML flag is raised, or the item hints at a suspicious transaction."
   }
  }
 }
}
```

## Expected

```json
{"route1": "question", "route2": "deadline_action", "route3": "optimization_review", "route4": "human_only", "route5": "human_only", "route6": "question"}
```
