# Dev Squad model selection: staged plan

Tracking: #105. Status: public-data inventory only; no paid benchmark or default change authorized yet.
Use the existing benchmark tower, tasks, judges and actual squad runner, not another orchestration system.

## Scope and baseline

Existing user harness stays lead. Optimize the nine OpenRouter specialist roles independently; do not change
Pi/Codex/Claude Code lead models or confuse provider with harness. Current config defaults: coder Haiku 5.5,
reviewer GLM 5.3 Flash, security DeepSeek v4.1 Flash. Triage/tester/doc-writer inherit coder; architect/
researcher/verifier inherit reviewer unless overridden. Inherited defaults are not benchmarked recommendations.
Prior 2026-10-27 squad-role report and Pi/Claude Code/Codex trials are baselines, not current per-role winners.

## Public shortlist inputs

OpenRouter public model list was fetched on 2026-10-29 through skills/flow-tower-costs/models.mjs.
Artificial Analysis intelligence/coding/speed results inform candidate selection only: different prompts,
effort, providers and harnesses mean they are not direct Dev Squad acceptance scores. OpenRouter rankings
measure usage/adoption, not quality. List-level tools support does not prove endpoint availability under
require_parameters/data_collection:deny. Cached-input zero/missing prices require endpoint verification.

Preliminary pool (verify live IDs/prices/endpoints again before paid calls):

| Candidate | Input $/M | Output $/M | Reason to include |
|---|---:|---:|---|
| anthropic/claude-haiku-5.5 | 0.10 | 0.50 | Current coder family baseline |
| z-ai/glm-5.3-flash | 0.0457 | 0.0742 | Current reviewer/planner family; finish-cap failures seen |
| deepseek/deepseek-v4.1-flash | 0.045 | 0.50 | Current security; empty answers seen in field |
| openai/gpt-6-luna | 0.10 | 0.50 | Prior coding catalogue pick; cross-family comparison |
| xiaomi/mimo-v2.6-flash | 0.14 | 0.28 | Low-cost alternative family |
| minimax/minimax-m3.1-flash | 0.15 | 0.60 | Newer alternative family |
| qwen/qwen3.8-flash | 0.15 | 0.47 | Alternative; previous policy availability needs recheck |
| google/gemini-3.8-flash | 0.825 | 4.125 | Prior review catalogue pick; higher-price quality control |

These are public list quotes, not measured task costs or final recommended models. Expensive frontier controls
can be added only for justified hard tasks after budget approval; do not test every listed model indiscriminately.
Free variants are not substitutes unless their endpoints meet the same data policy and reliability requirements.

## Experiment sequence and decision rule

1. Inventory existing category tasks/judges and real squad failures. Map all nine roles; identify missing
   tester/verifier/research tasks rather than rename unrelated benchmark categories to pretend coverage.
2. Write held-out task fixtures and answer keys first. At least two tasks per role, include difficult/clean
   controls, known bugs and realistic context. Security: planted vulnerability and clean negative controls;
   tester/verifier: failing tests and false success; planning/research: verifiable facts; docs: factual accuracy;
   coder: independent test outcomes and forbidden-path checks. Finish/valid verdict compliance is mandatory.
3. Finalize 3–5 candidates per role, current default included, several families. Publish role matrix, quality
   thresholds, expected tokens/calls, total upper spend proposal and latency preference BEFORE paid trials.
4. Public-data reads and dry runs first. After explicit benchmark budget approval, endpoint smoke one task/
   candidate; stop early on policy failures, bad tool calls or invalid finish/verdict. No silent fallback.
5. Survivors: identical prompts/tools/effort/caps, minimum three repetitions per task/model. Writable runs
   get isolated fresh repositories. Packed review/security are separate from loops. Record actual provider,
   cold/warm cache, successful/failed attempts, latency median/spread, steps/tokens and billed/unknown costs.
6. Deterministic judging first, then blind rubric for non-deterministic quality. Never use candidate identity
   to score an answer. Benchmark runner versus real squad runner parity must be checked before default changes.
7. Reject models below predeclared quality threshold. Among comparable acceptable quality, select cheapest
   per successful task including failures/retries, then faster; report latency/quality trade-offs and explicit
   escalation option. Small samples are illustrative, not proof of superiority. A missed planted critical
   vulnerability or dishonest verifier pass is unacceptable even if overall average score is high.
8. Save sanitized reports/artifacts and update catalogue/role settings/tower metadata only after sign-off.
   Preserve model overrides. Tower/task/code changes follow tower-first, squad writer, tests, review/security.

## Spend boundaries

The earlier $1 draft-PR acceptance authorization does NOT authorize this benchmark. No paid smoke calls yet.
Propose a small initial ceiling after dry-run/token estimates, monitor after every group, stop before exceeding
approved spend; current runner does not enforce a global dollar cap. Count failures/retries and unknown costs.
Never send keys, private repository contents or user credentials to benchmark APIs. Public synthetic fixtures only.

## Sources

- https://openrouter.ai/api/v1/models (public catalogue via models.mjs)
- https://openrouter.ai/collections/programming (usage, not quality)
- https://artificialanalysis.ai/leaderboards/models
- https://artificialanalysis.ai/agents/coding-agents
- README.md and results/2026-10-27-squad-roles.md in this benchmark example
- ../../skills/flow-tower-costs/SKILL.md and ../../tools/squad/roles.mjs
