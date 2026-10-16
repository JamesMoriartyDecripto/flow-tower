# Tower optimizer: before/after

## a2a-concierge.tower.yaml — A2A Purchasing Concierge

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | a2a.result | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | concierge.confirmed | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | concierge.route | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | concierge.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD07 | platform.deploy_engine | info | no outgoing edge: connect it, or make it the target of a call |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD07 | sellers.auth | info | no outgoing edge: connect it, or make it the target of a call |
| AUD10 | - | info | 3 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 25 | 25 | 0 |
| edges | 32 | 34 | +2 |
| agents | 3 | 3 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 1 | 0 |
| withOps.approval | 1 | 1 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/burger-seller.tower.yaml — Burger seller internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | crew.confirmed | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 2 | 2 | 0 |
| nodes | 9 | 9 | 0 |
| edges | 10 | 10 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 1 | 1 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/pizza-seller.tower.yaml — Pizza seller internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 2 | 2 | 0 |
| nodes | 8 | 8 | 0 |
| edges | 9 | 9 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What changed and why

- **AUD04, `fail: closed` on all four decisions**, each from the example's code or prompts:
  - `concierge.route`: a seller name not on the agent cards raises `ValueError` in `purchasing_agent.py`, so no task is sent.
  - `concierge.confirmed`: unless the same items and total were confirmed earlier, the question goes to the user (`prompts/concierge.md`).
  - `a2a.result`: text that is not clearly an order is relayed as a question; the prompt forbids making up an order ID.
  - burger `crew.confirmed`: no confirmation in the text means the seller answers with the total and asks (`prompts/burger-seller.md`).
- **AUD04 `concierge.route`, one edge per answer:** `route -> send_task` is split into a burger and a pizza edge (it was one edge labelled "burger | pizza").
- **AUD07 `platform.deploy_engine`:** `deploy_engine -> concierge.concierge`: `deploy_to_agent_engine.py` deploys the concierge's AdkApp.
- README: the typed decisions are now described as `fail: closed`.

## Open findings and why

- **AUD07 `sellers.auth`:** `status: planned` (Cloud Run IAM with an ID token on every A2A call); the codelab deploys with `--allow-unauthenticated`. Nothing runs after it yet.
- **AUD10:** the codelab sets no budget or run-wide limit; the only bound is the 30 s httpx timeout. A number here would be invented.

Pattern review (rubric): line 1, a router (the concierge) in front of two remote agents over A2A, one seller at a time: the simplest pattern for it [S1]. Line 7: the planned IAM guard is the real gap (sellers accept unauthenticated calls), already drawn as `status: planned`. No rubric finding was kept.

## Models to benchmark

None: the concierge runs on gemini-2.5-flash and the sellers on gemini-2.5-flash-lite, already the small models of the codelab, and the example has no eval cases to compare candidates on.

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0022 (issue #231).
- Applied: the README now says "on doubt no task is sent and no order is reported" (for the router no question goes to the user); `a2a.result`'s description quotes the prompt rules it rests on.
- Not applied: "the link target should be the bare id `concierge`": cross-layer `links` use `layer.node`, and validate resolves `concierge.concierge`.
