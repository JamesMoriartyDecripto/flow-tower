# Tower optimizer: before/after

## ebook-studio.tower.yaml — Ebook Studio

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | editing.fact_check | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | editing.line_edit | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | market.lead | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | production.alt_text | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD04 | launch.next | warning | decision with no fail: set decision.fail to open or closed |
| AUD11 | editing.copy_edit | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | launch.arc | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD07 | launch.audiobook | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 7 | 7 | 0 |
| nodes | 50 | 50 | 0 |
| edges | 78 | 80 | +2 |
| agents | 14 | 14 | 0 |
| withOps.budget | 6 | 6 | 0 |
| withOps.limits | 6 | 10 | +4 |
| withOps.approval | 8 | 8 | 0 |
| withOps.evals | 9 | 9 | 0 |
| withOps.sandbox | 5 | 6 | +1 |

### Model changes

_none_

## towers/chapter.tower.yaml — Chapter writing loop

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | revise.gate | warning | decision with no fail: set decision.fail to open or closed |

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
| nodes | 15 | 15 | 0 |
| edges | 19 | 19 | 0 |
| agents | 5 | 5 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 1 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 2 | 2 | 0 |
| withOps.sandbox | 5 | 5 | 0 |

### Model changes

_none_


## What changed and why

- **AUD02, `market.lead`, `editing.line_edit`, `editing.fact_check`, `production.alt_text`:** `limits: { concurrency: 4 }`. Drafting already ran "four at a time to stay under rate limits" (`drafting.dispatch`, `prompts/publishing-lead.md`). The lead's prompt now applies the same cap to every phase, so the cap in the tower is true for line edits, fact-checks and alt text too.
- **AUD11, `editing.copy_edit`:** `sandbox: { network: none, filesystem: workspace }`. Its Bash only runs Vale on the chapters (`prompts/copy-editor.md`), and CLAUDE.md allows the manuscript to leave the studio only to the Claude API and the originality vendor.
- **AUD04, `launch.next`:** `fail: closed`: when the digest does not say whether it is an erratum or a new edition, nothing is uploaded and the lead decides. The decision also gets its two ways out, `launch.next -> publishing.kdp` (corrected upload, same ISBN) and `launch.next -> drafting.dispatch` (new edition, new chapters), as its description already said.
- **AUD04, chapter `revise.gate`:** `fail: closed`: a review that cannot be read counts as blocking, so a chapter is never handed off on doubt.

## Open findings and why

- **AUD02 `launch.arc`:** a human step (ARC readers, 30-60 sign-ups), not a pool of agent sessions; nothing runs concurrently on the studio's side. Possible audit false positive: fan-out on a `human` node.
- **AUD07 `launch.audiobook`:** `status: planned`, the last option of the launch layer; it has no step after it yet.
- **AUD10 chapter sub-tower:** the root tower sets the $140 model budget per book, and the writer agent has its $4 / 60 turns per chapter; the chapter loop is part of that run.

Pattern review (rubric): line 1, orchestrator-workers with a per-chapter evaluator-optimizer loop and human gates at every phase: the simplest split for a book where the author owns the words [S1]. Line 5: no agent has `match` rules and three logs cover drafting, build and launch; events still land by agent name. Line 6: proofs, EPUBCheck and Ace gate production. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| writing | `editing.dev_edit` | claude-opus-5-5 | marketing (the audit says "coding") | The editorial letter on the whole manuscript: the most expensive editing step |
| orchestrator | `outline.outliner` | claude-opus-5-5 | none | Chapter plan and style sheet, signed by the author: a Sonnet run against the same outline sign-off |
| writing | `drafting.writer` | claude-sonnet-5-5 | marketing (the audit says "coding") | 10-14 sessions per book: the highest volume |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0029 (issue #231).
- Applied: the lead's limit now says it caps the specialist sessions it dispatches; the README names the sessions that have the cap (the copy editor runs once, not per chapter); the `launch.next` description now says a new edition goes back to drafting, as its new edge shows.
- Not applied: "check Vale's cache path is inside the workspace": Vale reads `config/vale.ini` and `config/vale/` in the repo, which is the workspace.
