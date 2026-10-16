# Tower optimizer: before/after

## browser-worker.tower.yaml — Legacy Portal Browser Worker

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | intake.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | session.mode | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | worker.outcome | warning | decision with no fail: set decision.fail to open or closed |
| AUD10 | - | info | 3 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | platform.secrets | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | verify.submit | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD07 | session.stop | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 35 | 35 | 0 |
| edges | 49 | 49 | 0 |
| agents | 3 | 3 | 0 |
| withOps.budget | 3 | 3 | 0 |
| withOps.limits | 6 | 6 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 3 | 3 | 0 |
| withOps.sandbox | 2 | 2 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD03 `verify.submit`:** the gate before this irreversible click is code, by design: the worker model has no Submit action, an independent verifier re-reads a fresh screenshot and `src/submit_guard.py` checks every `verify: true` field of the field map; any mismatch raises `Blocked` and goes to human review. A person approving every endorsement would remove the reason for the system.
- **AUD03 `platform.secrets`:** the Secrets Manager entry is the guard that keeps the portal password away from the model; nothing in it is an action to approve.
- **AUD07 `session.stop`:** the cleanup call in a `finally` block, the end of every session.

Pattern review (rubric), quotes checked with `check-quotes.mjs`:
- Line 7, `verify.submit` (info, S6): keep the submit gate in code; a sampled human check of submitted items would measure the verifier without slowing the queue.
- Line 1: a single computer-use worker with a separate verifier and a deterministic guard: the simplest pattern for a portal with no API.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| review | `verify.verifier` | claude-opus-5-5 | programming | One-turn screenshot check against a field list: compare Sonnet on the verifier evals (it needs vision) |
| general | `worker.worker` | claude-sonnet-5-5 | none | The computer-use loop: keep a computer-use capable model; benchmark only on recorded portal sessions |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0020 (issue #231). Applied: the run-wide limit now cites `config/browser.yaml` (`max_concurrent_sessions: 6`) and reads "one try and 2 retries" to match `retries: 2` and `MAX_ATTEMPTS = 3`; the routing decision lists `src/intake.py`, where its fail-closed behaviour lives. The other points confirmed the three `fail` policies.
