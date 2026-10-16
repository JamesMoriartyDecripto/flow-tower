# Tower optimizer: before/after

## chief-of-staff.tower.yaml — Ambient Chief of Staff

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | orchestration.cos | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | orchestration.delegate | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | orchestration.cos | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | specialists.send | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | specialists.workspace_mcp | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | harness.durable | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | orchestration.needs_user | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | orchestration.needs_user | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | orchestration.plan_first | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | triggers.from_me | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | triggers.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD10 | - | info | 7 agents with no tower budget or limits: add a run-wide budget |
| AUD11 | specialists.recruiter | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | specialists.drafter | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | specialists.scheduler | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | triggers.history | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | harness.durable | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | surfaces.style | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD05 | orchestration.cos | info | feeds output with no evals: add evals to measure the answer |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 54 | 54 | 0 |
| edges | 72 | 75 | +3 |
| agents | 7 | 7 | 0 |
| withOps.budget | 3 | 3 | 0 |
| withOps.limits | 1 | 2 | +1 |
| withOps.approval | 3 | 6 | +3 |
| withOps.evals | 2 | 2 | 0 |
| withOps.sandbox | 3 | 4 | +1 |

### Model changes

_none_

## towers/financial-analyst.tower.yaml — Financial analyst internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | analysis.kind | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 16 | 16 | 0 |
| edges | 19 | 19 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 1 | 1 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD03 `specialists.drafter`, `specialists.scheduler`:** they fire on `credentials: user`, but their tools only read (`Read`, `get_thread`; `Read`, `free_busy`). What they produce reaches the world only through a review card and the send gate, which are on the lead, the workspace MCP and the send node. A per-draft approval on the subagent would describe a second checkpoint the code does not have (squad review point).
- **AUD03 `triggers.history`:** `history.list` only reads new message ids with the user's token, and nothing leaves the worker at this step. The gate belongs on sends, where it already is (`specialists.send`, `specialists.workspace_mcp`, `orchestration.cos`).
- **AUD04 `harness.durable`:** NO_CHANGE writes nothing, so there is no edge to draw. Inventing one would misstate `ambient/reflect.py`. The decision now says `fail: closed` (a failed reflection writes nothing).
- **AUD04 `surfaces.style`:** both answers (executive and technical) start the same Chief of Staff run with a different `outputStyle`. It is a setting, not a branch.
- **AUD05 `orchestration.cos`:** a terminal answer has no logged outcome to score. The inbox flows already have evals (`triage`, `email-drafter`).

Pattern review (rubric):
- Line 1: routing plus orchestrator-workers behind a human review. That is the simplest pattern that fits an ambient assistant [S1].
- Lines 4-6: nothing found.
- One kept finding (line 3, `specialists.workspace_mcp`, quote "get_thread, free_busy, mark_read, send_email, send_invite"): reads and sends share one MCP server. The send gate covers it, but a separate send server would let the drafter and the scheduler load only the read tools (risk, S6, info).
- A line-2 finding on `harness.reflect` was dropped by `check-quotes.mjs`, because the script does not see one-line flow-style nodes (`- { id: reflect, agent: reflect }`). It is listed below as a model to benchmark.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| general (rule rewrite) | `harness.reflect` | claude-opus-5-5 | none | Rewrites one section from one feedback event: try Sonnet on past events |
| orchestrator | `orchestration.cos` | claude-opus-5-5 | programming | The audit calls it "coding" (it has Bash), but it mainly delegates: benchmark as an orchestrator |
| writing | `specialists.drafter` | claude-sonnet-5-5 | marketing, translation | Already has an eval ("drafts sent unedited", target 0.6) to compare candidates on |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0031 (issue #231).
- Applied:
  - `exactly_once` is removed from `specialists.send`, because the code has no idempotency key for a retried send;
  - the approvals on the drafter and the scheduler are removed, because their tools only read.
- Not applied:
  - the recruiter sandbox stays `network: none`, because WebSearch is a server tool that runs on Anthropic's side, not in the shell;
  - `send` approval actions `[approve, edit]` stay, because only those two answers lead to a send (reject and respond do not);
  - the tower-level `limits` stays, because the schema allows it and validate passes.
