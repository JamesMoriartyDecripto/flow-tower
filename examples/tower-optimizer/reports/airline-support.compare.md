# Tower optimizer: before/after

## airline-support.tower.yaml — Airline Customer Service

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD01 | agents.faq | warning | loops with no budget or limits: add limits.max_iterations or a budget |
| AUD01 | agents.flight_info | warning | loops with no budget or limits: add limits.max_iterations or a budget |
| AUD01 | agents.refunds | warning | loops with no budget or limits: add limits.max_iterations or a budget |
| AUD01 | agents.triage | warning | loops with no budget or limits: add limits.max_iterations or a budget |
| AUD04 | agents.wants_human | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | agents.wants_human | warning | decision with no fail: set decision.fail to open or closed |
| AUD10 | - | info | 6 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | agents.resume | warning | decision with 1 outgoing edge(s): add one edge per answer |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 50 | 50 | 0 |
| edges | 80 | 81 | +1 |
| agents | 6 | 6 | 0 |
| withOps.budget | 1 | 1 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 2 | 2 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What changed and why

- **AUD01 (triage, faq, flight_info, refunds) and AUD10:** a tower-level `limits: { max_iterations: 10 }`. Each user message is one `Runner.run_streamed` with the Agents SDK default `max_turns` (10), and `airline_server.py` catches `MaxTurnsExceeded`, so a triage ↔ specialist handoff loop stops after 10 turns. The tower already had this as `budget.turns` on `api.runner`; the audit reads loop bounds on the agents or the tower.
- **AUD04 `agents.wants_human`:** `fail: closed` (on an error a ticket opens, the customer is not kept with the bot) and the "no" answer `wants_human -> triage [return]`. The node is a planned production extension, as before.

## Open findings and why

- **AUD04 `agents.resume`:** its second answer is "the last active agent", any of the six; those paths are already drawn as handoffs. One edge per agent would draw six arrows for one line of code (`AGENTS[state.current_agent_name]`).

Pattern review (rubric): line 1, decentralized handoffs with no orchestrator, as in OpenAI's demo: for one conversation at a time this is the simplest pattern [S5]. Line 2: guardrails already run on gpt-4.1-mini. Line 6: refunds call `faq_lookup` before `issue_compensation`, and payouts above 500 USD go to the duty manager. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| router | `agents.triage` | gpt-5.2 | none | It only routes, with at most one tool call first: a small model is the natural candidate |
| general | `agents.faq` | gpt-5.2 | none | It answers only from `faq_lookup_tool` |
| guard | `api.relevance`, `api.jailbreak` | gpt-4.1-mini | none | Run on every message: latency matters, and they have eval targets |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0019 (issue #231). No problems; one label nit applied: the "no" edge now says Triage keeps the floor (the check is called from Triage).
