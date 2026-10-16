# Tower optimizer: before/after

## ai-video-studio.tower.yaml — AI Video Studio

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD01 | brief.hooks | warning | loops with no budget or limits: add limits.max_iterations or a budget |
| AUD02 | brief.producer | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | edit.reframe | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | publish.reels | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | publish.tiktok | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | publish.yt | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | brief.route | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | brief.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | script.fits | warning | decision with no fail: set decision.fail to open or closed |
| AUD10 | - | info | 12 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | publish.thumbs | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | script.variants | warning | fan-out with no limits: add limits.concurrency or limits.timeout |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 7 | 7 | 0 |
| nodes | 53 | 54 | +1 |
| edges | 87 | 88 | +1 |
| agents | 12 | 12 | 0 |
| withOps.budget | 10 | 10 | 0 |
| withOps.limits | 14 | 16 | +2 |
| withOps.approval | 5 | 8 | +3 |
| withOps.evals | 4 | 4 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/shot.tower.yaml — Shot pipeline

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | check.good | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 15 | 15 | 0 |
| edges | 19 | 19 | 0 |
| agents | 2 | 2 | 0 |
| withOps.budget | 4 | 4 | 0 |
| withOps.limits | 5 | 5 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD02 `publish.thumbs`:** `fanout: 3` is a fixed count of A/B arms (A, B, C). It cannot grow with the task. Possible audit false positive: a fixed fan-out is already bounded.
- **AUD02 `script.variants`:** 2-4 copies, one per target format (45 s short, long-form, paid cut). The count is set by the brief's formats, and the writer runs inside the producer's session (now 6 in parallel, 120 turns). The code has no separate pool, so any cap here would be invented.

Fixed through other means:
- AUD01 on `brief.hooks` (the hooks ↔ producer return) cleared once the producer got its limits.
- The new `brief.reply` output gives the intake route its other two answers (needs info, decline). It is drawn from `prompts/intake.md` (`missing[]`, `reason`). This is a structural change (M): the example has no Slack reply code.

Pattern review (rubric):
- Line 1: orchestrator-workers plus a per-shot evaluator-optimizer loop (score ≥ 7, max 3 takes). That fits generative media, where takes fail often [S1, S8].
- Line 7: consent, C2PA signing and the disclosure flags are handled as a whole, before the client approves.
- Nothing else found. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| writing | `script.variants` | claude-opus-5-5 | programming (mislabelled; it is writing) | Reformats an approved master script per platform: try Sonnet |
| writing | `script.writer` | claude-opus-5-5 | none | The master script: keep a strong writer, benchmark against Sonnet on past briefs |
| general (hooks) | `brief.hooks` | claude-sonnet-5-5 | none | Scores hooks against a bank: it has an eval (predicted 3 s hold) to compare candidates on |
| vision QA | `qa.frame_qa` | claude-sonnet-5-5 | none (filter by modality: image input) | A vision model judged on the frame QA cases |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0015 (issue #231): no problems.
