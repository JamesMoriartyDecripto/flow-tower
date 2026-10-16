# Tower optimizer: before/after

## social-studio.tower.yaml — Social Media Studio

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | community.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | listening.spike | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | review.risk | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | creation.copywriter | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | creation.repurpose | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | community.boost | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | community.meta_ads | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD07 | community.boost_ok | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 6 | 6 | 0 |
| nodes | 49 | 49 | 0 |
| edges | 63 | 63 | 0 |
| agents | 10 | 10 | 0 |
| withOps.budget | 8 | 8 | 0 |
| withOps.limits | 7 | 7 | 0 |
| withOps.approval | 7 | 7 | 0 |
| withOps.evals | 6 | 6 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/publisher.tower.yaml — Publisher internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | dispatch.job | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | dispatch.token | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 16 | 16 | 0 |
| edges | 23 | 23 | 0 |
| agents | 0 | 0 | 0 |
| withOps.budget | 1 | 1 | 0 |
| withOps.limits | 9 | 9 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What the fixes declare

Each `fail` field carries its own `decision.description`, taken from the example's config and prompts:
- **community.route** is `closed`. Nothing auto-sends on doubt: `faq` only when a template answers the question completely, and `crisis` on any trigger, even in a calm tone. Everything else becomes a draft that a person sends (`prompts/triage.md`, `config/triage-rules.yaml`).
- **listening.spike** is `closed`. Any one crisis trigger is enough, so a borderline signal goes to the comms lead and pauses the queue.
- **review.risk** is `open`. Only the listed triggers make a post high; everything else is `standard` (`config/approval-policy.yaml`) and still goes through the post approval.

## Open findings and why

| rule | node | why it stays open |
| --- | --- | --- |
| AUD02 | creation.copywriter, creation.repurpose | Each fan-out is bounded by its input: at most 14 briefs a week and at most 8 platforms a brief, and each copywriter has a $0.60 budget. No code in the example dispatches them, so a concurrency number would be invented. |
| AUD03 | community.boost, community.meta_ads | The agent can only create **PAUSED** campaigns. `src/hooks/publish-gate.ts` denies every Meta Ads update, delete, activate or budget call. A person switches a campaign on at `boost_ok` (24 h, reject on timeout, €300 a week). |
| AUD03 | publisher `dispatch.job` | A publish job exists only after a person approved the post: it carries that `approvalId`, and the `once` guard drops a repeat. The gate is upstream (`review.approve`), not the immediate predecessor. |
| AUD03 | publisher `dispatch.token` | The token vault itself, which is where the secrets are kept. |
| AUD07 | community.boost_ok | The last human step: the campaign then runs in Ads Manager, outside the studio. |

## Recommendations from the pattern review

| line | node | finding | change | effect · source |
| --- | --- | --- | --- | --- |
| 7 | tower (agent `copywriter`) | `fanout: { min: 8, max: 14, by: briefs in the approved week }` | `prompts/strategist.md` writes 8-12 slots a week. Cap the fan-out at 12, or let the strategist write up to 14. | quality · engineering judgement |

## Models to benchmark

These rows come from the audit's model-fit table. The models are not changed here: the benchmark runs later, across towers, on each role's own cases.

| role | node | current model | OpenRouter categories | why |
| --- | --- | --- | --- | --- |
| planner | strategy.strategist | claude-opus-5-5 | none | One calendar a week. A Sonnet-class model may plan it as well. |
| writing | creation.repurpose | claude-sonnet-5-5 | marketing, translation | 4-8 calls per asset, each fitting one asset into platform specs. A Haiku-class model is a candidate. |
| writing | creation.copywriter | claude-sonnet-5-5 | marketing, translation | 8-14 calls a week. Brand voice matters, so only switch if the brand guard's scores hold. |

The audit labels these roles as "coding", "orchestrator" and "general"; the roles above are what the prompts describe.

## Review

The squad reviewer (GLM 5.3 FlashX, $0.0018) confirmed the three `fail` fields, the open reasons and the
recommendation. It found one point, which turned out not to be a problem: it asked where "pauses the queue" comes
from. It is the tower's own link `community.crisis -> publishing.pause [call]: pause queue`, which was not in the
facts given to the reviewer, so the text stays.
