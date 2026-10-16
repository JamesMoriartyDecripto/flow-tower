# Tower optimizer: before/after

## legal-diligence.tower.yaml — Legal Due Diligence

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | review.dispatch | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD04 | risk.severity | warning | decision with no fail: set decision.fail to open or closed |
| AUD10 | - | info | 10 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | governance.dms | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 36 | 36 | 0 |
| edges | 54 | 54 | 0 |
| agents | 10 | 10 | 0 |
| withOps.budget | 9 | 9 | 0 |
| withOps.limits | 8 | 9 | +1 |
| withOps.approval | 5 | 5 | 0 |
| withOps.evals | 8 | 8 | 0 |
| withOps.sandbox | 7 | 7 | 0 |

### Model changes

_none_

## towers/clause-review.tower.yaml — Clause reviewer internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | extract.present | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | output.confidence | warning | decision with no fail: set decision.fail to open or closed |
| AUD10 | - | info | 3 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 12 | 12 | 0 |
| edges | 13 | 13 | 0 |
| agents | 3 | 3 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 3 | 3 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 3 | 3 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD03 `governance.dms`:** fires on `credentials: user`. The agents' DMS tools only read (`mcp__dms__read_playbook`, `mcp__dms__read_template`); the one write, filing the report, happens after the partner's sign-off (`awaitApproval(matterId, 'report')` in `src/pipeline.ts`), so the gate is upstream, not the immediate predecessor the rule looks for.

Pattern review (rubric), quotes checked with `check-quotes.mjs`:
- Line 7, `governance.dms` (info, S6): keep the agents' DMS tools read-only and the filing after the partner's sign-off, as today; a write tool given to an agent later needs its own approval.
- Line 2, `risk.scorer` (info, S5): the scorer applies the playbook's `severity_rules` to rows a lawyer already approved; benchmark Sonnet against Opus on past matters before keeping Opus.
- Line 1: orchestrator-workers with a fixed checkpoint after every stage; nothing simpler meets five clause families over a thousand documents.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| general | `risk.scorer` | claude-opus-5-5 | none | Rule-driven scoring of approved rows: Sonnet is a candidate, measured on past matters |
| general | `review.consistency` | claude-opus-5-5 | none | Outlier and gap search over the review table: compare with Sonnet on recall of planted inconsistencies |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0018 (issue #231). One point applied: the sub-tower limit no longer claims a retry count that no file implements. The concurrency values, the three `fail: closed` reasons and the schema shapes were confirmed against `src/pipeline.ts`, `src/extract.ts` and the two prompts.
