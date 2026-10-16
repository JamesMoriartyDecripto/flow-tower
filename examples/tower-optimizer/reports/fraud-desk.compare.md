# Tower optimizer: before/after

## fraud-desk.tower.yaml — Fraud Review Desk

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | review.record | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | intake.route | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | review.thresholds | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | platform.secrets | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | desk.override | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD07 | data.rerank | info | no outgoing edge: connect it, or make it the target of a call |
| AUD07 | desk.sar | info | no outgoing edge: connect it, or make it the target of a call |
| AUD07 | platform.env | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 42 | 42 | 0 |
| edges | 57 | 58 | +1 |
| agents | 2 | 2 | 0 |
| withOps.budget | 2 | 2 | 0 |
| withOps.limits | 3 | 3 | 0 |
| withOps.approval | 2 | 3 | +1 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 1 | 1 | 0 |

### Model changes

_none_


## What changed and why

- **AUD03 `review.record` (`exactly_once`):** `approval` with `when: "any escalation rule in config/thresholds.yaml matches"`, `per: transaction`, `by: fraud analyst`, `via: escalate tool`. This is the gate the example already has: the reviewer must call `escalate` and wait for `human_decision` before `record_decision` (`prompts/reviewer.md`, `src/gate_loop.py`); clear-cut cases are recorded by the agent, as designed.
- **AUD04 `review.thresholds`:** `fail: closed`: a rule that cannot be checked (a tool failed or returned no data) escalates. The rule is new and written in both places the tower cites: `prompts/reviewer.md` ("Unchecked") and its mirror `config/thresholds.yaml` (`unchecked_rule`), which the nightly eval checks decisions against. README updated.
- **AUD04 `intake.route`:** its third answer drawn, `route -> review.terminal_guard [return]`: a second terminal call gets `already_decided` (`src/gate_loop.py`).

## Open findings and why

- **AUD03 `platform.secrets`:** the host-side secret store is the guard that keeps keys out of the sandbox; nothing in it is an action to approve.
- **AUD04 `desk.override`:** its "no" answer (the analyst agreed) writes nothing; only overrides become labels.
- **AUD07 `data.rerank`:** `status: experimental`, an optional step inside the search (`ENABLE_RERANK=1`), not drawn as its own hop back.
- **AUD07 `desk.sar`:** the BSA/AML team's SAR decision is the end of the case in this system.
- **AUD07 `platform.env`:** a guard (limited network environment), not a step with an output.

Pattern review (rubric): line 1, one agent per batch with a hard gate, deterministic thresholds and a human escalation path: simpler than a multi-agent desk for a fixed checklist [S1]. Line 6: the terminal guard and the nudge make sure every id ends with exactly one decision. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| review | `review.reviewer` | claude-haiku-5-5 | programming | It has evals (analyst agreement, threshold recall): compare against Sonnet on recall of escalations, where a miss is costly |
| general | `desk.packet` | claude-sonnet-5-5 | none | A case packet summary for the analyst: Haiku is a candidate |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0020 (issue #231). The approval, the `fail: closed`, the thresholds mirror and the README were confirmed.
- Not applied: "the `already_decided` edge should start from the reviewer": `intake.route` is the gate loop's routing step (its own description: "a second terminal call is refused"), so the refusal is one of its answers.
- Not applied: "`via: escalate tool` → `via: escalate`": `via` is free text for the channel, as the analyst's "case management console".
