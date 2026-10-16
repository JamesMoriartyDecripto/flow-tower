# Tower optimizer: before/after

## dev-squad.tower.yaml — Dev Squad

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | intake.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | quality.verdict | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | specialists.green | warning | decision with no fail: set decision.fail to open or closed |
| AUD11 | quality.reviewer | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | quality.verifier | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | specialists.coder | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | specialists.tester | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | tools.builtin | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | memory.promote | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD05 | intake.triage | info | feeds output with no evals: add evals to measure the answer |
| AUD05 | orchestration.lead | info | feeds output with no evals: add evals to measure the answer |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 8 | 8 | 0 |
| nodes | 62 | 62 | 0 |
| edges | 99 | 99 | 0 |
| agents | 10 | 10 | 0 |
| withOps.budget | 5 | 5 | 0 |
| withOps.limits | 2 | 2 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 5 | +5 |

### Model changes

_none_

## towers/coder.tower.yaml — Coder internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD11 | edit.plan_edit | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 16 | 16 | 0 |
| edges | 18 | 18 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 1 | +1 |

### Model changes

_none_

## towers/researcher.tower.yaml — Researcher internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | fanout.split | warning | fan-out with no limits: add limits.concurrency or limits.timeout |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 14 | 14 | 0 |
| edges | 18 | 18 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What the fixes declare

The sandboxes record what `src/` and `deploy/` enforce today, not a target:
- **Filesystem.** Every agent runs in one container (`deploy/docker-compose.yml`) on an issue worktree. The OpenRouter coder writes only under `src/`, `tests/` and `e2e/` of that worktree (`safePath` in `src/openrouter-agent.ts`), and Claude sessions are held there by `worktreeFence` (`src/hooks/index.ts`). The reviewer's tool set is read-only.
- **Network.** It is `open`: nothing restricts the container's egress, and the whitelisted `run` commands (`npx`, `semgrep`) can reach the network.

So AUD11 is answered on the filesystem side only; the network side is the first open recommendation below.

The three `fail: closed` match the code:
- the triage throws on a failed or invalid answer, and the pipeline then stops and comments on the issue;
- the review loop's `lastJson` throws on a non-JSON verdict;
- a red or unclear suite goes back to the coder.

## Open findings and why

| rule | node | why it stays open |
| --- | --- | --- |
| AUD04 | memory.promote | "Not seen twice" writes nothing: the finding stays only in the session log, which is already its input. An edge would draw a step that does not exist. |
| AUD02 | researcher `fanout.split` | A fixed fan-out of four tracks issued in one turn, bounded by the researcher's 20 turns; a `limits.concurrency: 4` would only restate the drawing. |
| AUD05 | intake.triage, orchestration.lead | The example has no logged outcomes to score; an `evals` entry would be invented numbers. |

## Recommendations from the pattern review

All three quotes were checked with `check-quotes.mjs`.

| line | node | finding | change | effect · source |
| --- | --- | --- | --- | --- |
| 7 | tools.builtin | `sandbox: { network: open, filesystem: workspace }` | Restrict the container's egress to the hosts the squad needs (api.anthropic.com, openrouter.ai, github.com, api.github.com, mcp.context7.com, semgrep.dev) with an egress proxy in `deploy/docker-compose.yml`. Then declare `network: allowlist` on the coder, tester, reviewer, verifier and this node. | risk · S9 |
| 6 | specialists.green | "a rule in the lead's prompt, not enforced in code" | Count the red rounds in `src/pipeline.ts` and stop at 2, as the review loop does for its own rounds. | risk · S1 |
| 5 | researcher `fanout.split` | "one query per track" | The tower draws four tracks, but `.claude/agents/researcher.md` names three (docs, codebase, web) and pins versions inside the docs track. Fold `fanout.versions` into `fanout.docs`, or add the track to the prompt. | quality · engineering judgement |

## Models to benchmark

These rows come from the audit's model-fit table. The models are not changed here: the benchmark runs later, across towers, on each role's own cases.

| role | node | current model | OpenRouter categories | why |
| --- | --- | --- | --- | --- |
| general (planner) | orchestration.architect | claude-opus-5-5 | none | A read-only planner. A Sonnet-class model may write the same plans for less. |
| review | quality.verifier | claude-opus-5-5 | programming | The final ship check. It stays strong on purpose, but it is the most expensive per-issue call after the lead. |
| coding | specialists.tester | claude-sonnet-5-5 | programming | It writes and runs tests. The Haiku coder on OpenRouter is the obvious candidate. |

## Review

The squad reviewer (GLM 5.3 FlashX, $0.0022) checked every field against the code and found one point. The README said
"a sandbox per acting agent", but the doc writer, which has no shell, has none. The claim now reads "each agent with
a shell or code tool".
