# Tower optimizer: before/after

## marketing-studio.tower.yaml — Marketing Studio

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | conversion.mql | warning | decision with no fail: set decision.fail to open or closed |
| AUD07 | content.ai_search | info | no outgoing edge: connect it, or make it the target of a call |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | content.writer | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | paid.creative | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | planning.brief | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | research.voc | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | paid.linkedin_ads | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | platform.secrets | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD07 | conversion.sdr | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 8 | 8 | 0 |
| nodes | 63 | 63 | 0 |
| edges | 94 | 95 | +1 |
| agents | 12 | 12 | 0 |
| withOps.budget | 15 | 15 | 0 |
| withOps.limits | 8 | 8 | 0 |
| withOps.approval | 7 | 7 | 0 |
| withOps.evals | 6 | 6 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/paid-media.tower.yaml — Paid media optimization loop

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | check.off_plan | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 21 | 21 | 0 |
| edges | 29 | 29 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 2 | 2 | 0 |
| withOps.limits | 5 | 5 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What the fixes declare

Each `fail` field carries its own `decision.description`:
- **conversion.mql** is `closed`. The lead scorer scores only what is there when inputs are missing (`prompts/lead-scorer.md`). A personal email with no company is capped at C and never auto-MQL (`sales/lead-scoring-rules.yaml`). So a doubtful lead goes to nurture, not to an SDR.
- **paid-media `check.off_plan`** is `closed`. A campaign with no ledger rows reads as 0 spend and is flagged as under-pacing (`scripts/pacing_check.py`), so missing data reaches the optimizer instead of a silent no-op.

A return edge `ai_search -> seo` records that the monthly AI-assistant citation panel goes back to the SEO strategist. Its prompt tracks citations "only as a directional panel".

## Open findings and why

| rule | node | why it stays open |
| --- | --- | --- |
| AUD02 | content.writer, paid.creative, research.voc | Each fan-out has a fixed maximum: 2-6 per approved brief, 3-6 per pillar and format, 3-6 per source batch. No code in the example dispatches them, so a concurrency number would be invented. |
| AUD02 | planning.brief | A document that starts three fixed lanes (SEO, paid, lifecycle), not a pool of workers. |
| AUD03 | paid.linkedin_ads | Every write is checked first, under `policies/spend-approval-policy.yaml`. Campaigns are created PAUSED (`paid.launch`), and each change set goes through `scripts/spend_guard.py`: hard limits no one can approve past, auto-apply only below €500/day and 20%, and the Head of Growth above that (4 h, reject on timeout). The member OAuth is the platform's requirement for LinkedIn. |
| AUD03 | platform.secrets | The service-account guard itself, with tokens in Secret Manager. |
| AUD07 | conversion.sdr | The human end of the funnel: the SDR works the lead in HubSpot. |

## Pattern review

Nothing found beyond the audit. Deterministic checks run before the agent (pacing, anomaly, spend guard), there are
human gates by threshold, and the claims register runs through the copy.

## Models to benchmark

These rows come from the audit's model-fit table. The models are not changed here: the benchmark runs later, across towers, on each role's own cases.

| role | node | current model | OpenRouter categories | why |
| --- | --- | --- | --- | --- |
| writing (strategy) | research.icp, research.messaging | claude-opus-5-5 | marketing | Personas and the messaging framework are written quarterly. Sonnet may be enough with the VoC evidence in the context. |
| analysis | measurement.analyst | claude-opus-5-5 | finance, marketing | The weekly report and attribution read. It is a candidate for Sonnet if the numbers come from SQL, not the model. |
| writing | content.writer, paid.creative | claude-sonnet-5-5 | marketing | They write the most per week. Only switch if the editor's and the policy check's pass rates hold. |

The audit labels these roles as "coding" or "orchestrator"; the roles above are what the prompts describe.

## Review

The squad reviewer (GLM 5.3 FlashX, $0.0018) found nothing to fix. It checked both `fail` fields, the new edge and the
reasons for the open findings against the code and the policy.
