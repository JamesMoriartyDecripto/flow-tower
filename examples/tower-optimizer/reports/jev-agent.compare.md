# Tower optimizer: before/after

## jev-agent.tower.yaml — Jev Agent

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | act.next | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | context.keep | warning | decision with no fail: set decision.fail to open or closed |
| AUD10 | - | info | 3 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD07 | act.escalate | info | no outgoing edge: connect it, or make it the target of a call |
| AUD09 | act.browser | info | no model: set model on the node or its agent |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 36 | 36 | 0 |
| edges | 64 | 64 | 0 |
| agents | 3 | 3 | 0 |
| withOps.budget | 2 | 2 | 0 |
| withOps.limits | 7 | 7 | 0 |
| withOps.approval | 3 | 3 | 0 |
| withOps.evals | 7 | 7 | 0 |
| withOps.sandbox | 3 | 3 | 0 |

### Model changes

_none_

## towers/browser.tower.yaml — Browser worker

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | decide.jev_step | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | decide.jev_step | warning | decision with 1 outgoing edge(s): add one edge per answer |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 11 | 11 | 0 |
| edges | 15 | 15 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 2 | 2 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD04 `decide.jev_step` (one way out):** the harness separates "Jev decides, code acts": the decision feeds `decide.op_policy`, the deterministic step that branches to execute, verify, blocked and re-observe (four links). A second edge from the decision itself would draw the same branches twice.
- **AUD07 `act.escalate`:** the developer's answer in the terminal is the end of the run (`src/main.ts`).
- **AUD09 `act.browser`:** the browser worker is a harness, not a model; its models are pinned on its own decision node (`jev-1.13.0`) and text writer (`inception/mercury-2.5`) in the sub-tower.

Pattern review (rubric): line 1, one worker loop with small Jev questions at each branching point and code acting on every answer: the branching logic is deterministic and testable (`scripts/calibrate.ts`). Line 6: a Stop hook checks the "done" claim before the run ends. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| orchestrator | `act.coder` | claude-sonnet-5-5 | none | Already routed per request (haiku / sonnet / opus by Jev's `route`); benchmark the routing thresholds with `scripts/calibrate.ts`, not the model |
| writing | `context.fallback` | claude-haiku-5-5 | marketing, translation | Only on compaction failures; no change unless the fallback rate grows |

The Jev decision nodes use one pinned decision model by design; re-calibrate before any version bump (`config/policy.yaml`).

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0033 (issue #231): no problems; each `fail` policy and the run-wide cap were matched to `src/loop.ts`, `src/compact.ts`, `src/browser.ts` and `config/policy.yaml`.
