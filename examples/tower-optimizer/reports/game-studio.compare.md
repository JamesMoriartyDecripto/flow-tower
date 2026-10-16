# Tower optimizer: before/after

## game-studio.tower.yaml — Forge Studio

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | assets.retopo | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | engine.integration_lead | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | marketing.positioning | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | preprod.designer | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | research.questions | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | review.round | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD04 | art.on_style | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | greenlight.fit | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | preprod.design_pass | warning | decision with no fail: set decision.fail to open or closed |
| AUD11 | engineering.gameplay | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | engineering.netcode | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | engineering.tools_eng | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | marketing.website | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | preprod.economy | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | qa.perf | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | release.release_engineer | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | review.code_reviewer | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | world.builder | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | engineering.spec | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD05 | engineering.tools_eng | info | feeds output with no evals: add evals to measure the answer |
| AUD07 | engine.audio_briefs | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 14 | 14 | 0 |
| nodes | 141 | 141 | 0 |
| edges | 225 | 225 | 0 |
| agents | 49 | 49 | 0 |
| withOps.budget | 12 | 12 | 0 |
| withOps.limits | 14 | 20 | +6 |
| withOps.approval | 7 | 7 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 9 | +9 |

### Model changes

_none_

## towers/art-pipeline.tower.yaml — Art pipeline

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | parallel.fork | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD04 | export.verdict | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | ticket.asset_class | warning | decision with 1 outgoing edge(s): add one edge per answer |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD05 | export.tagger | info | feeds output with no evals: add evals to measure the answer |
| AUD10 | - | info | 5 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 25 | 25 | 0 |
| edges | 33 | 34 | +1 |
| agents | 5 | 5 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 2 | +1 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/engineering.tower.yaml — Engineering

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | review.verdict | warning | decision with no fail: set decision.fail to open or closed |
| AUD07 | review.escalate | info | no outgoing edge: connect it, or make it the target of a call |
| AUD11 | implement.gameplay | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | implement.netcode | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | implement.tools | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | review.perf | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | review.reviewer | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | spec.risk | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD10 | - | info | 7 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 23 | 23 | 0 |
| edges | 31 | 33 | +2 |
| agents | 7 | 7 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 1 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 5 | +5 |

### Model changes

_none_

## towers/marketing.tower.yaml — Marketing & launch

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | insight.positioning | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD11 | assets.website | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD05 | launch.community | info | feeds output with no evals: add evals to measure the answer |
| AUD10 | - | info | 8 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 20 | 20 | 0 |
| edges | 24 | 24 | 0 |
| agents | 8 | 8 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 2 | +1 |
| withOps.approval | 1 | 1 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 1 | +1 |

### Model changes

_none_

## towers/material-bake.tower.yaml — Material & bake

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 13 | 13 | 0 |
| edges | 15 | 15 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/playtest-bot.tower.yaml — Playtest bot

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 11 | 11 | 0 |
| edges | 12 | 12 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 1 | 1 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/qa-playtest.tower.yaml — QA & playtest

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | plan.matrix | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD11 | analysis.perf | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD10 | - | info | 8 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 21 | 21 | 0 |
| edges | 27 | 27 | 0 |
| agents | 8 | 8 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 2 | 3 | +1 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 1 | +1 |

### Model changes

_none_

## towers/unreal-integration.tower.yaml — Unreal integration

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | level.streaming | warning | fan-out with no limits: add limits.concurrency or limits.timeout |

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
| nodes | 22 | 22 | 0 |
| edges | 27 | 27 | 0 |
| agents | 5 | 5 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 1 | +1 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/world-gen.tower.yaml — World generation

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD11 | build.builder | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD05 | validate.pacing | info | feeds output with no evals: add evals to measure the answer |
| AUD10 | - | info | 3 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 20 | 20 | 0 |
| edges | 24 | 24 | 0 |
| agents | 3 | 3 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 1 | +1 |

### Model changes

_none_


## Open findings and why

| rule | node | why it stays open |
| --- | --- | --- |
| AUD02 | engineering.spec, engineering `spec.risk` | `engineering.ts` runs every independent task with an uncapped `Promise.all`; a cap in the tower would not match the code. Fix it in the code first (a pool of ~3 sessions, like `art.ts`), then add `limits.concurrency`. |
| AUD05 | engineering.tools_eng, art-pipeline `export.tagger`, marketing `launch.community`, world-gen `validate.pacing` | No measured scores exist in the example; an `evals` entry would be made-up numbers. Add them from real runs. |
| AUD07 | engine.audio_briefs | A deliverable (cue sheets and the licence record), not a step that can fail silently; its licence check is the license-check hook. |
| AUD10 | art-pipeline, engineering, marketing, qa-playtest, unreal-integration, world-gen | Sub-towers of Forge Studio, which sets the run-wide budget ($400, `STUDIO_BUDGET_USD`); the code has no per-department budget, so none is written. |

## Models to benchmark

From the audit's model-fit table: the roles where a cheaper model could plausibly hold quality. Not changed here; the
benchmark runs later, across towers, on each role's own cases.

| role | nodes | current model | OpenRouter categories | why |
| --- | --- | --- | --- | --- |
| review | preprod.critic, review.code_reviewer, export.review, review.reviewer, level.review, campaign.brand | claude-opus-5-5 | programming | Six evaluators on Opus, each run up to 3 rounds: the largest recurring cost. GLM 5.3 FlashX is the dev-squad reviewer. |
| research | greenlight.tech_director | claude-opus-5-5 | academia | One feasibility memo per pitch; a Sonnet-class model with citations may be enough. |
| coding | engineering.tools_eng | claude-sonnet-5-5 | programming | Editor utilities and pipeline scripts; a Haiku-class coder may be enough. |

## Review

The squad reviewer (GLM 5.3 FlashX, $0.006) found the art fan-out understated (up to 6 Blender sessions, fixed) and the
review-round cap without a source (reworded to one evaluator per review type). It also asked to add the HTTP MCP hosts
(api.githubcopilot.com, mcp.figma.com) to the `sandbox` allowlists: not applied, because those calls are made by the
harness, not by the shell that `sandbox` isolates.
