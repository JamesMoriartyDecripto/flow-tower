# Tower optimizer: before/after

## sre-incident.tower.yaml — SRE Incident Responder

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | intake.dedupe | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | investigation.signature | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | remediation.decision | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | remediation.recovered | warning | decision with no fail: set decision.fail to open or closed |
| AUD11 | investigation.builtin | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | intake.session | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | platform.secrets | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 46 | 46 | 0 |
| edges | 57 | 57 | 0 |
| agents | 4 | 4 | 0 |
| withOps.budget | 4 | 4 | 0 |
| withOps.limits | 5 | 5 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 2 | 2 | 0 |
| withOps.sandbox | 3 | 4 | +1 |

### Model changes

_none_

## towers/remediator.tower.yaml — Remediator internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | edit.scope | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | ship.result | warning | decision with no fail: set decision.fail to open or closed |
| AUD11 | edit.copy | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | edit.diff | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | edit.plan | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 2 | 2 | 0 |
| nodes | 15 | 15 | 0 |
| edges | 16 | 16 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 1 | 1 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 3 | +3 |

### Model changes

_none_


## Open findings and why

- **AUD03 `intake.session` (`exactly_once`):** creating the investigation session is the whole point of the page. The investigator only reads: its tools have edit and write disabled, and its sandbox is read-only. `exactly_once` is the Redis dedupe (one session per incident), not a high-impact action. A human gate here would delay every response to a page. The write path already has its human: `request_approval` before `merge_pull_request`.
- **AUD03 `platform.secrets` (`data: secret`):** it is the host-side secret store, a guard that keeps the PagerDuty, Datadog, GitHub and Slack tokens out of the sandbox. Nothing in it is an action to approve. Possible audit false positive: a `guard` that holds secrets is the control, not a step that needs one.

Pattern review (rubric):
- Line 1: two agents in separate sessions (read-only investigation, write-through-PR remediation) with a human merge gate. That is the simplest split that keeps the write path reviewable [S1, S6].
- Line 5: both agents have `match` rules and logs.
- Line 6: the rollout watcher checks recovery before the incident is resolved.
- Nothing else found. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| research / diagnosis | `investigation.investigator` | claude-opus-5-5 | programming | It has an eval (signature accuracy 0.91 on replayed incidents) to compare candidates on |
| coding | `remediation.remediator` | claude-opus-5-5 | programming | It has evals (PRs approved without edits, fixes reverted in 24 h) |
| writing | `closeout.scribe` | claude-sonnet-5-5 | marketing (the audit says "coding") | A postmortem draft from archived events: a writing benchmark |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0021 (issue #231).
- Applied: two wordings. The recovery fallback now says "escalate (still failing)", matching its edge. The scope check now says only minimal diffs reach the approver.
- Not applied:
  - The sandbox on `investigation.builtin` is "duplicated" from the agent, but the tool node is what runs bash, and AUD11 checks the node.
  - The `cp` writes to `/tmp`, "outside the workspace", but `/tmp` is inside the per-session container, which is the remediator's own workspace sandbox.
