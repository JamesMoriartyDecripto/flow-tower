# Tower optimizer: before/after

## towers/backend.tower.yaml — Backend lane internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | handlers.stripe | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD10 | - | info | 5 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | handlers.webhook | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 19 | 19 | 0 |
| edges | 22 | 22 | 0 |
| agents | 5 | 5 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 1 | 0 |
| withOps.approval | 2 | 3 | +1 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 5 | 5 | 0 |

### Model changes

_none_

## towers/frontend.tower.yaml — Frontend lane internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | page.rsc | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | inputs.design_ctx | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD07 | page.island | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 16 | 16 | 0 |
| edges | 18 | 18 | 0 |
| agents | 2 | 2 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 2 | 2 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 2 | 2 | 0 |

### Model changes

_none_

## web-studio.tower.yaml — Website & Web Design Studio

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | design.copy | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | design.visual | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | backend.stripe | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | platform.vercel_mcp | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | brief.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | launch.in_scope | warning | decision with no fail: set decision.fail to open or closed |
| AUD07 | frontend.islands | info | no outgoing edge: connect it, or make it the target of a call |
| AUD10 | - | info | 13 agents with no tower budget or limits: add a run-wide budget |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | brief.kickoff | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | design.ds | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | platform.figma | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 8 | 8 | 0 |
| nodes | 59 | 59 | 0 |
| edges | 84 | 85 | +1 |
| agents | 13 | 13 | 0 |
| withOps.budget | 6 | 6 | 0 |
| withOps.limits | 5 | 7 | +2 |
| withOps.approval | 7 | 9 | +2 |
| withOps.evals | 6 | 6 | 0 |
| withOps.sandbox | 4 | 4 | 0 |

### Model changes

_none_


## Open findings and why

- **AUD02 `brief.kickoff`:** a human sign-off that starts two specialists. The spawned researcher already has its fan-out cap and limits (3-6 copies, 15 min timeout), and SEO has a $5 budget. A cap on the person who signs would mean nothing.
- **AUD02 `page.rsc` (frontend):** `fanout: { max: 3, by: locales }` is fixed by the three locales (en, da, de) and cannot grow with the task. Possible audit false positive: a fan-out with a fixed small `max` is already bounded.
- **AUD03 `design.ds`, `platform.figma`, `inputs.design_ctx` (frontend):** they fire on `credentials: user`.
  - `get_design_context` only reads.
  - The `use_figma` writes go to a versioned Figma file, and client sign-off 3 (`design.design_ok`) reviews the result before anything is built on it.
- **AUD03 `handlers.webhook` (backend):** the human act is the customer's payment on Stripe's page (now an approval on both Stripe nodes). The webhook runs after it, signature-checked and idempotent by event id (`exactly_once`). Nobody can approve each webhook in real time.
- **AUD07 `page.island` (frontend):** the island runs in the visitor's browser. Its calls (checkout, enquiries) are drawn in the root tower as the new link `frontend.islands -> backend.api`.

Pattern review (rubric):
- Line 1: an orchestrator-workers pattern with client sign-offs between phases, and two parallel build lanes joined by a contract. That fits the agency workflow the tower describes [S1, S8].
- Lines 3-7: nothing found that the audit fixes above do not already cover.
- No rubric finding was kept.

Prompt rule added so the tower's cap is true: `prompts/studio-lead.md` now says "Dispatch at most 6 specialists at a time … queue the rest". The `limits.concurrency: 6` on `design.visual` and `design.copy` rests on that rule. The code has no pool: `runPhase` lets the lead dispatch through the Agent tool.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| general (Figma variables, components) | `design.ds` | claude-opus-5-5 | none | Structured edits in Figma: try Sonnet on the library build |
| coding / IA | `discovery.ia` | claude-opus-5-5 | programming | Sitemap and content model: the audit calls it coding (Write), benchmark as a planner |
| writing | `design.copy` | claude-sonnet-5-5 | marketing, translation | 10-30 copies per project in three locales: the largest volume, try a cheaper writer with a translation score |
| research (monitor) | `launch.monitor` | claude-haiku-5-5 | academia | Weekly log reading: Haiku is likely right; the category ("research") looks like an audit mislabel |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0027 (issue #231). All five points were checked against the files, and none needed a change:
1. "The copywriter's $12 budget is invented": no. `agents.copywriter.budget` is `{ usd: 12, on_exceed: pause }` in the tower. It was missing from the facts given to the reviewer.
2. "README says per phase, the tower says per run": both are right. One run is one `runPhase` query, which is one phase.
3. "The concurrency is a prompt rule, not enforced": it is stated as such in the tower descriptions, in the README and above.
4. "`backend.api` may not exist": it does (route handlers), and validate passes.
5. "The deploy guard is ask/deny, not an approval flow": an `ask` is the studio lead's approve or reject on that call, so the approval names it.
