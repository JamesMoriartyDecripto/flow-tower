# Tower optimizer: before/after

## release-auditor.tower.yaml — Release Auditor

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | ship.triage | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | gates.secrets | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD05 | ship.triage | info | feeds output with no evals: add evals to measure the answer |
| AUD10 | - | info | 9 agents with no tower budget or limits: add a run-wide budget |
| AUD11 | scope.lead | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | ship.triage | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 6 | 6 | 0 |
| nodes | 31 | 31 | 0 |
| edges | 43 | 43 | 0 |
| agents | 9 | 9 | 0 |
| withOps.budget | 6 | 6 | 0 |
| withOps.limits | 3 | 3 | 0 |
| withOps.approval | 1 | 1 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 7 | 7 | 0 |

### Model changes

_none_

## towers/e2e-sweep.tower.yaml — E2E Sweep

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | layout.panels | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD02 | tower.open | warning | fan-out with no limits: add limits.concurrency or limits.timeout |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 16 | 16 | 0 |
| edges | 17 | 17 | 0 |
| agents | 0 | 0 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 1 | 3 | +2 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What changed and why

- **AUD04 `ship.triage`:** `fail: closed`, with the rule it needs written where the lead reads it: `config/severity.md` now says "When the level is unclear, rank the finding one level higher: the maintainer can still defer it, the lead cannot." The README already described the typed decisions as fail closed.
- **AUD02 e2e sub-tower, `tower.open` and `layout.panels`:** `limits: { concurrency: 3 }`, the Playwright workers of `playwright.config.ts` (`workers: CI ? 2 : 3`). The fan-out over projects and sizes never runs wider than that.

## Open findings and why

- **AUD11 `scope.lead` and `ship.triage` (the lead's Bash):** the lead is the maintainer's own Claude Code session on the laptop, and nothing sandboxes it today; declaring a sandbox would describe a control that does not exist. Recommendation: run the sweep with Claude Code's Bash sandbox on (`"sandbox": { "enabled": true }`, filesystem the checkout, network to the Claude API, GitHub, npm and the Semgrep registry), then declare it here.
- **AUD03 `gates.secrets`:** gitleaks only reads the history and redacts its output; `data: secret` describes what it may find. The action on a real hit (rotate, then rewrite history) is the maintainer's. Possible audit false positive: a read-only scan flagged for the data it looks for.
- **AUD05 `ship.triage`:** the severity ranking has no measured outcome to score yet; the v0.x reports record findings, not triage accuracy.
- **AUD10:** the sweep has turn budgets per finder and timeouts, but no run-wide cost cap in the scripts or prompts; a number here would be invented.

Pattern review (rubric): line 1, orchestrator-workers (one finder per charter) with an adversarial verifier, as in Anthropic's code review write-up [S1]. Line 6: every finding needs a reproduction before triage, and fixes are re-gated. No rubric finding was kept.

## Models to benchmark

| role | node | current model | categories | why |
|---|---|---|---|---|
| coding | `finders.docs` | claude-opus-5-5 | programming | Markdown rendering, links and stale facts: the least code-heavy finder |
| coding | `finders.ux` | claude-opus-5-5 | programming | Reads Playwright and axe reports more than code |
| review | `verify.verifier` | claude-opus-5-5 | programming | Keep Opus as the baseline: the verifier is what keeps false positives out; benchmark only against a stronger or equal model |

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0014 (issue #231). Both points applied: the workers cap now cites `workers: CI ? 2 : 3` (not `fullyParallel`) and says 3 is the local maximum; the triage decision's description now states the low-confidence behaviour `fail: closed` encodes (a doubtful finding ranks higher, never slips through as minor).
