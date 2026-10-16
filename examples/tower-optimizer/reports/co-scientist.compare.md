# Tower optimizer: before/after

## co-scientist.tower.yaml — AI Co-Scientist

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | generate.pass_initial | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | tools.private_lit | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD07 | tools.lab | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 36 | 36 | 0 |
| edges | 52 | 52 | 0 |
| agents | 9 | 9 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 2 | 2 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 3 | 3 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/tournament.tower.yaml — Elo tournament

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | pair.top | warning | decision with no fail: set decision.fail to open or closed |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 12 | 12 | 0 |
| edges | 14 | 14 | 0 |
| agents | 2 | 2 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 1 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD04 `pair.top` (tournament):** a deterministic rule, `match_format()` in `src/elo_tournament.py` (both in the top 10 → debate). No model answers it, so there is no error or low-confidence case to fail open or closed.
- **AUD03 `tools.private_lit`:** `status: experimental`, a read-only search of the lab's own index under the user's grant.
- **AUD07 `tools.lab`:** wet-lab validation by scientists, the last human step of a session (12 weeks, outside the system).

Pattern review (rubric), quotes checked with `check-quotes.mjs`:
- Line 6, `generate.pass_initial` (info, engineering judgement): `admit()` admits any verdict that is not exactly `"reject"`; check the verdict against the three candidates and treat an unknown label as reject, so the gate is closed on odd answers too. A code change, so the tower states today's behaviour.
- Line 1: a supervisor with specialist agents and an Elo tournament, as in the paper the example follows; the tournament is what ranks hypotheses, so no simpler pattern fits.

## Models to benchmark

Every agent runs on `gemini-2.0-flash`, as in the open reproduction the example follows. Worth a benchmark on a past research goal:

| role | node | current model | categories | why |
|---|---|---|---|---|
| review | `generate.deep_review`, `tournament.meta` | gemini-2.0-flash | programming | Critique and meta-review set the tournament's signal: compare a stronger reasoning model |
| research | `generate.generation`, `tournament.evolution` | gemini-2.0-flash | academia | Search-grounded generation: compare on novelty and citation quality |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0014 (issue #231). One point applied: the decision's description no longer claims that only pass or revise are admitted; `admit()` only drops an exact "reject", which is now said, and the stricter check is a rubric finding.
