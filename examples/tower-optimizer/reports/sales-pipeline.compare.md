# Tower optimizer: before/after

## sales-pipeline.tower.yaml — Sales Pipeline: prospect to invoice

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | outreach.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | prospecting.tier | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | qualification.qualified | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | qualification.qualified | warning | decision with no fail: set decision.fail to open or closed |
| AUD07 | analytics.analyst | info | no outgoing edge: connect it, or make it the target of a call |
| AUD07 | invoicing.ar_manager | info | no outgoing edge: connect it, or make it the target of a call |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | prospecting.tier | warning | decision with 1 outgoing edge(s): add one edge per answer |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 8 | 8 | 0 |
| nodes | 63 | 63 | 0 |
| edges | 82 | 85 | +3 |
| agents | 12 | 12 | 0 |
| withOps.budget | 12 | 12 | 0 |
| withOps.limits | 8 | 8 | 0 |
| withOps.approval | 9 | 9 | 0 |
| withOps.evals | 7 | 7 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/outreach.tower.yaml — Outreach sequence engine

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | replies.route | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 21 | 21 | 0 |
| edges | 27 | 27 | 0 |
| agents | 2 | 2 | 0 |
| withOps.budget | 2 | 2 | 0 |
| withOps.limits | 5 | 5 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What changed and why

- **AUD04, `fail: closed` on the four open decisions**, each from the example's own rules:
  - `outreach.route` and the sub-tower's `replies.route`: `reply-triage-rules.yaml` sends a label below 0.7 confidence to the rep, so nothing is acted on automatically.
  - `prospecting.tier`: a score that cannot be computed is not contacted (`prospect-scoring.yaml`: "a signal without evidence scores 0").
  - `qualification.qualified`: without the AE agreeing, the deal stays in nurture (`meddicc-scorecard.md`).
- **AUD04, `qualification.qualified` second way out:** "not qualified: nurture tasks for the missing elements" to the HubSpot MCP, the scorecard's "Otherwise: nurture with the missing elements as tasks".
- **AUD07 `invoicing.ar_manager`:** `ar_manager -> dunning [return]`: the payment follow-up drafts the stage the AR manager approves; `prompts/payment-followup.md` mentions late interest only at the formal-notice stage.
- **AUD07 `analytics.analyst`:** `analyst -> targeting.icp [return]` (as `winloss -> icp` already is): the digest proposes ICP, scoring and sequence changes "for the quarterly review" (`prompts/pipeline-analyst.md`).
- README: the `decision` line now says all four are `fail: closed`.

## Open findings and why

- **AUD04 `prospecting.tier` (one way out):** only tier A has a next step (the sequencer). B means "watch for a trigger event; re-score monthly" and C "do not contact": neither is a step in the pipeline. The monthly re-score of tier B is a schedule, not a step: an edge back to the weekly run would draw a loop through the scorer.

Pattern review (rubric): line 1, a pipeline of stages with human gates at every decision that binds the company (the README's rule); the simplest pattern for it [S1]. Line 7: lawful-basis check and suppression run before any credit is spent or any message sent. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| research | `analytics.analyst` | claude-opus-5-5 | academia (the audit says "coding") | A weekly digest from SQL results: Sonnet is a candidate |
| review | `analytics.winloss` | claude-opus-5-5 | programming | Themes with counts and quotes from closed deals |
| general | `qualification.meddicc` | claude-sonnet-5-5 | none | A scorecard from a transcript: structured output, a cheaper model may score as well |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0027 (issue #231).
- Applied: the analyst's proposals edge is `[return]`, like the existing `winloss -> icp`; the AR manager edge label names what the payment follow-up drafts.
- Not applied: "the AR manager edge is not backed": the node's description ("Decides on formal notice, late interest…") and `prompts/payment-followup.md` back it. "The README claims the discount gate is `fail: closed`": it already was. "Two edges `qualified -> crm` may collide": the schema keeps both (85 edges counted) and each label is one answer of the decision.
