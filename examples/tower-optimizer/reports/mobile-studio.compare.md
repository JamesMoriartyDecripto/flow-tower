# Tower optimizer: before/after

## mobile-studio.tower.yaml — Mobile App Studio

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | build.app_lead | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | discovery.aso | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | discovery.lead | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | discovery.reviews | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | product.designer | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | release.beta | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | release.listing | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | rollout.triage | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD03 | architecture.backend | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | platform.expo_mcp | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | release.signing | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | architecture.stack | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | architecture.stack | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | release.verdict | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | rollout.hotfix | warning | decision with no fail: set decision.fail to open or closed |
| AUD07 | rollout.ota | info | no outgoing edge: connect it, or make it the target of a call |
| AUD07 | rollout.phased | info | no outgoing edge: connect it, or make it the target of a call |
| AUD10 | - | info | 18 agents with no tower budget or limits: add a run-wide budget |
| AUD11 | release.submit | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | platform.figma | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 8 | 8 | 0 |
| nodes | 64 | 64 | 0 |
| edges | 95 | 99 | +4 |
| agents | 18 | 18 | 0 |
| withOps.budget | 9 | 9 | 0 |
| withOps.limits | 12 | 20 | +8 |
| withOps.approval | 7 | 10 | +3 |
| withOps.evals | 7 | 7 | 0 |
| withOps.sandbox | 6 | 7 | +1 |

### Model changes

_none_

## towers/android.tower.yaml — Android lane internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | inputs.design | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 12 | 12 | 0 |
| edges | 12 | 12 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 1 | 1 | 0 |
| withOps.limits | 3 | 3 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 1 | 1 | 0 |

### Model changes

_none_

## towers/ios.tower.yaml — iOS lane internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | inputs.design | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 13 | 13 | 0 |
| edges | 14 | 14 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 1 | 1 | 0 |
| withOps.limits | 2 | 2 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 1 | 1 | 0 |
| withOps.sandbox | 1 | 1 | 0 |

### Model changes

_none_


## Changes by rule

- **AUD03, human gates:**
  - `architecture.backend`: a tech-lead PR review before a production migration or Edge Function. Agents write only to the development project (backend-lead rule 7).
  - `release.signing`: certificate, key and service-account changes are made by a person (`credentials/README.md`); the release guard denies agents any read.
  - `platform.expo_mcp`: a production `build_submit` needs the product owner's approval, asked in Slack through request_approval; `src/hooks/release-guard.ts` blocks the call without its id.
- **AUD11:** `release.submit` gets a sandbox. Its Bash runs `eas` and fastlane, so the allowlist is the Expo, App Store Connect and Play Developer API hosts (plus Google OAuth), with the workspace filesystem.
- **AUD02:**
  - the studio lead runs at most 8 specialists at a time; the rule was added to `prompts/studio-lead.md`, since discovery alone can ask for 28;
  - the app lead runs 2 lane sessions;
  - timeouts on the review miner, ASO, store copy and triage workers, the designer variants and the 5-day beta window.
- **AUD04:**
  - the stack decision gets its way back (`stack -> architect [return]`) and `fail: closed`: no approved ADR, no backend;
  - the store verdict gets `fail: closed`: an unknown status means no rollout;
  - the fix path gets `fail: closed`: an unsure fingerprint goes to a store build.
- **AUD07:** the iOS phased release, the Play staged rollout and the OTA update now reach the installed base.
- **AUD10:** a 190 USD run budget per release cycle: the lead's 40 USD (specialists included) plus the four Claude Code sessions (50 + 35 + 35 + 30).

## Open findings and why

- **AUD03 `platform.figma`, `inputs.design` (iOS and Android lanes):** flagged because they use `credentials: user` (the designer's Figma OAuth).
  - The lane nodes only call `get_design_context`, which is read-only.
  - `use_figma` writes to a versioned Figma file, and the design is gated by `product.design_ok` before anyone builds on it.
  - A per-call approval would add a gate with nothing irreversible behind it. Possible audit false positive: `credentials: user` on a read-only tool.

## Pattern review (rubric, quotes checked)

- **Line 1, simplest pattern:** orchestrator-workers for research, chaining with gates for the rest. Nothing simpler fits a two-store release. Nothing found.
- **Line 3, tools:**
  - `discovery.reviews` (`agent: review-miner`) and `rollout.triage` (`agent: triage`) take `mcp__appfigures__*`. Naming the read tools they need keeps a new write tool off by default; triage handles PII. Info, S6.
  - `release.submit` (`agent: release`) has two paths to a store submission: Bash `eas submit` and `mcp__expo__build_submit`. Both are guarded, but one path is easier to audit. Info, S3.
- **Line 5, tracing:** `build.app_lead` (`agent: app-lead`) and the lanes have no `match` rules or log resources. Events from the Mac sessions land by agent name only. Info, S2.
- **Lines 2, 4, 6, 7:** nothing found beyond the rule findings. The release manager follows `release/release-checklist.md` before acting, and the risk gates are covered above.

## Models to benchmark

| role | node | current model | categories | why |
| --- | --- | --- | --- | --- |
| coding | build.ios, build.android (and the lane `native.*` nodes) | claude-opus-5-5 | programming | Lane work is scoped by the shared contract; Sonnet may hold quality at lower cost. |
| orchestrator | build.app_lead | claude-opus-5-5 | none | The largest budget (50 USD); worth a Sonnet run on the project's own tasks. |
| research | release.resolve | claude-opus-5-5 | academia | Maps a rejection to a guideline; a mid model with citations may do. |
| review | build.reviewer | claude-sonnet-5-5 | programming | The mobile checklist is structured; a cheaper reviewer may match. |

Role labels look off for non-coding writers: `release.listing` (copy), `product.spec` and `discovery.aso` show as "coding" because they have Read/Write tools; `product.designer` shows as "research"; `release.submit` shows as "review". Treat those rows with care.

## Squad review (GLM 5.3 FlashX, 0.006 USD)

- **Applied:** the Expo MCP approval's `via` is now Slack. The release guard enforces the gate; it is not the channel.
- **Not applied, edges to `devices`:** the reviewer saw only the diff. `rollout.devices` exists, and validation passes.
- **Not applied, `per: run` on the budget:** the schema has no "release cycle" unit, and the description defines the run as one cycle. The cron agents keep their own per-run budgets.
