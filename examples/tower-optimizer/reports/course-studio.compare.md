# Tower optimizer: before/after

## course-studio.tower.yaml — Syllabus Forge

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | brief.route | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD07 | assessment.adaptive | info | no outgoing edge: connect it, or make it the target of a call |
| AUD07 | content.legacy_lint | info | no outgoing edge: connect it, or make it the target of a call |
| AUD07 | content.localizer | info | no outgoing edge: connect it, or make it the target of a call |
| AUD07 | media.dubbing | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 12 | 12 | 0 |
| nodes | 109 | 109 | 0 |
| edges | 162 | 162 | 0 |
| agents | 18 | 18 | 0 |
| withOps.budget | 3 | 3 | 0 |
| withOps.limits | 3 | 3 | 0 |
| withOps.approval | 5 | 5 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/assessment.tower.yaml — Assessment internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 18 | 18 | 0 |
| edges | 21 | 21 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/fact-check.tower.yaml — Fact-check internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | verdict.supported | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 13 | 13 | 0 |
| edges | 16 | 16 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/media.tower.yaml — Media internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 18 | 18 | 0 |
| edges | 23 | 23 | 0 |
| agents | 2 | 2 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/module-writer.tower.yaml — Module writer internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 18 | 18 | 0 |
| edges | 20 | 20 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/review-board.tower.yaml — Review board internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD10 | - | info | 5 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 18 | 18 | 0 |
| edges | 24 | 24 | 0 |
| agents | 5 | 5 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 1 | 0 |
| withOps.approval | 1 | 1 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD07 `assessment.adaptive`:** `status: planned`, no step exists yet.
- **AUD07 `content.legacy_lint`:** `status: deprecated`, the old nightly readability script, replaced by the PreToolUse reading-level gate.
- **AUD07 `content.localizer`, `media.dubbing`:** `status: experimental` trials (es-ES and de-DE, module 1) whose output a human translator reviews outside the pipeline.
- **AUD10 `towers/review-board`:** the root tower sets the run budget ($60 per course, `LIMITS.courseUsd`) and the 6-subagent cap.

Pattern review (rubric): line 6, every stage ends in a quality gate and three human checkpoints, and claims are fact-checked before publish; line 7, regulated topics are declined by code without an accredited SME. No rubric finding was kept.

## Models to benchmark

Worth a benchmark on past courses:

| role | node | current model | categories | why |
|---|---|---|---|---|
| review | `review.pedagogy`, `review.rights` | claude-opus-5-5 | programming | Two Opus reviewers per round: compare Sonnet on the round's blocker recall |
| writing | `review.consolidate` | claude-opus-5-5 | marketing, translation | Merges reviewer notes into one list: Sonnet is a candidate |
| coding (a writer) | `design.architect` | claude-opus-5-5 | programming | Curriculum design, once per course: keep unless the quality gates hold with Sonnet |

The audit labels the writers (`content.writer`, `media.script`, `publish.marketer`) "coding" because they have file tools; they are writing roles.

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0013 (issue #231): no problems; both `fail: closed` reasons were matched to `src/intake.ts` and `.claude/agents/fact-checker.md`.
