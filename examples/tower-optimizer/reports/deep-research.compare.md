# Tower optimizer: before/after

## deep-research.tower.yaml — Deep Research Team

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | intake.effort | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | intake.need_input | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | synthesis.verified | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | search.confluence | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | search.gdrive | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD03 | search.searcher | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | intake.effort | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD07 | ops.rollout | info | no outgoing edge: connect it, or make it the target of a call |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 5 | 5 | 0 |
| nodes | 36 | 36 | 0 |
| edges | 43 | 43 | 0 |
| agents | 10 | 10 | 0 |
| withOps.budget | 1 | 1 | 0 |
| withOps.limits | 5 | 5 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 4 | 4 | 0 |
| withOps.sandbox | 1 | 1 | 0 |

### Model changes

_none_

## towers/searcher.tower.yaml — Searcher internals

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | plan.internal | warning | decision with 1 outgoing edge(s): add one edge per answer |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | loop.parallel | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD10 | - | info | 4 agents with no tower budget or limits: add a run-wide budget |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 13 | 13 | 0 |
| edges | 13 | 14 | +1 |
| agents | 4 | 4 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 4 | 4 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What the fixes declare

Each `fail` field carries its own `decision.description`, taken from `src/`:
- **intake.need_input** is `closed`. An unreadable clarifier answer raises (`json.loads` in `research_pipeline.py`, with no `except`), so the run stops before any search.
- **synthesis.verified** is `closed`. An unreadable verdict raises in `verify_loop.py`, so the report is not delivered.
- **intake.effort** is `open`. An unknown class runs as `comparison` (`plan_for` in `config.py`), with at most `max_concurrent_research_units * 2` searchers (5 run at once).

The searcher sub-tower's `plan.internal` now has its second answer, `no = web search first`, next to `yes = Drive + wiki first`.

## Open findings and why

| rule | node | why it stays open |
| --- | --- | --- |
| AUD03 | search.gdrive, search.confluence, search.searcher | They read only, under the requesting user's own OAuth grant: Drive is read-only, and the wiki is filtered to the spaces the user can read. Nothing is sent, paid or deleted. |
| AUD04 | intake.effort | Every class goes to the same lead. The class sets how many searchers run (`plan_for`), so a second edge would only repeat the first. |
| AUD02 | searcher `loop.parallel` | The parallel tool calls inside one searcher turn are already bounded: `fanout` max 5, and `max_uses` equals the searcher's call budget (`searcher.py`). The searchers themselves are capped by `asyncio.Semaphore(max_concurrent_research_units = 5)` in `lead.py`. |
| AUD10 | searcher sub-tower | The root tower sets the run-wide budget ($12 per run) and a 45-minute limit. |
| AUD07 | ops.rollout | The last step of a deploy, a terminal state rather than a failure that could vanish. |

## Pattern review

Nothing found beyond the audit. The tower already follows Anthropic's orchestrator-workers research pattern, with
effort scaling, a semaphore, a 2-round verify loop and a run budget.

## Models to benchmark

These rows come from the audit's model-fit table. The models are not changed here: the benchmark runs later, across towers, on each role's own cases.

| role | node | current model | OpenRouter categories | why |
| --- | --- | --- | --- | --- |
| writing | synthesis.writer | claude-opus-5-5 | marketing, translation | It writes the final report once per run: one of the most expensive calls. Sonnet may hold quality with the verifier behind it. |
| writing | search.compress | claude-sonnet-5-5 | marketing, translation | It compresses findings for every searcher, so it runs many times per run. A Haiku-class model may be enough. |
| review | ops.judge | claude-opus-5-5 | programming | The eval judge. Keep it strong unless a cheaper judge agrees with people on the eval set. |

## Review

The squad reviewer (GLM 5.3 FlashX, $0.0014) found one point: the effort cap is `max_concurrent_research_units * 2`
searchers per plan, not the semaphore's 5. It is fixed in the tower and in this report. The reviewer confirmed the two
`closed` decisions and the new edge against the code.
