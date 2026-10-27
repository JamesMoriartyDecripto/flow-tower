# Dev Squad

A multi-agent **software delivery system** built on the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) (TypeScript).
Label a GitHub issue `squad:go` and Dev Squad triages it, plans, researches, codes,
tests, reviews, verifies and opens a **draft** pull request. A human merges.

This is the flagship flow-tower example: it is meant to be read, not run. To run a dev squad on your own
project, use the kit instead: `flow-tower squad init <project>` (the same coder, reviewer and security models,
your coding agent as the lead; [tools/squad](../../tools/squad/README.md)).

## Open it

```bash
node bin/flow-tower.js examples/dev-squad/dev-squad.tower.yaml
```

Click any node to see its prompt, tools, model and source files. The **researcher**
and **coder** nodes drill down into their own towers.

## What it demonstrates

| Pattern | Where |
|---|---|
| Routing | `src/triage.ts` (Haiku, JSON schema output, policy overrides) |
| Cross-model review | `src/config.ts` (`ROLE_MODEL`), `src/openrouter-agent.ts` (Haiku codes, GLM reviews, DeepSeek audits, Claude verifies) |
| Orchestrator-workers | `src/orchestrator.ts` (`query()` with `options.agents`) |
| Parallelization | researcher tracks; reviewer + security auditor in `Promise.all` |
| Evaluator-optimizer (max 3 rounds) | `src/loop/review-loop.ts` |
| Prompt chaining with gates | `src/pipeline.ts` |
| Fresh-context verifier | `src/loop/verify.ts` |
| Human in the loop | `src/tools/request-approval.ts` + `src/loop/await-approval.ts` (the lead ends its session, the pipeline polls and resumes it); approve, approve with changes (`/squad approve <notes>`: parts moved out of scope become follow-up issues via `file_followup`) or revise, draft PRs, merge denied |
| Failure path | `src/pipeline.ts`: any throw or the $15 issue budget comments on the issue and logs the run |
| Lifecycle hooks | `src/hooks/` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) |
| Least-privilege subagents | `.claude/agents/*.md` |
| Memory | `CLAUDE.md`, `memory/patterns.md`, `memory/session-log.md` |
| Simplicity rules | `memory/patterns.md` (every role) and the reviewer's `simplicity` score: Cognitive Complexity ≤ 15, comments consistent with the code, no helper without a caller |
| Format + lint in every harness | `src/format-and-lint.ts`: the project's own Prettier and ESLint after each write, from the PostToolUse hook in Claude sessions and from the OpenRouter loop |
| Dependency check | `src/tools/osv.ts`: OSV.dev advisories of a package version and the fix of its range; the security auditor's `osv_scan`, in the SDK and the OpenRouter loop |

## Mixed models

The maintainer runs the squad with mixed models (`ROLE_MODEL` in `src/config.ts`). Claude plans,
arbitrates and verifies; cheaper models code, review and audit through
[OpenRouter](https://openrouter.ai), so the reviewer never shares the coder's blind spots.

| Role | Provider | Model | $ in / out per M tokens |
|---|---|---|---|
| Lead, fresh verifier, last-round fixer | Claude Agent SDK | `claude-opus-5-5` | Claude account |
| Coder | OpenRouter | `anthropic/claude-haiku-5.5` | 0.10 / 0.50 |
| Reviewer (read-only) | OpenRouter | `z-ai/glm-5.3-flashx` | 0.37 / 1.25 |
| Security auditor (read-only) | OpenRouter | `deepseek/deepseek-v4.1-flash` | 0.30 / 1.20 |
| Architect, researcher / triage, tester, doc-writer | Claude Agent SDK | Sonnet 5.5 / Haiku 5.5 | Claude account |

Prices as of 2026-10-10, from `https://openrouter.ai/api/v1/models`; Haiku's from
`node skills/flow-tower-costs/models.mjs anthropic/claude-haiku-5.5`. Field numbers from issue #70
of the flow-tower repo: coder round 1, 50 steps, $0.13, 231 tests green; reviewer 6 steps, $0.085, one
blocking bug found; security auditor 9 steps, $0.06. The coder moved from DeepSeek to Haiku after the
2026-10-11 benchmark and field trial: about a third of the steps and of the cost on a real task. Full GLM 5.3 was tried first as the reviewer: it
reasoned 1-2.5 min per step and timed out at step 9 ($0.24), so the squad uses its FlashX variant.

The OpenRouter roles run in `src/openrouter-agent.ts`, an OpenAI-style tool loop (sample code: the
real runner is session tooling outside this repo). Claude Code hooks do not run there, so the fences
are in code: read tools for every role, `edit_file` / `write_file` / `delete_file` for the coder only and only under
`src/`, `tests/`, `e2e/` (`write_file` refuses `tmp-`/`zz-`/`probe`/`scratch` names: throwaway probes
belong in a real test), a command whitelist instead of a shell, a secret-path deny list, low reasoning effort,
a `session_id` per run (OpenRouter keeps it on the provider that holds its prompt cache), a step and
dollar cap, and a live tower event per tool call. SDK subagents are Claude only, so the lead reaches
the coder through the `run_coder` tool (`src/tools/run-coder.ts`).

## Operational fields used

Top-level `budget` ($15 per issue run) and `limits` (4 concurrent subagents), agent `budget`
(`maxBudgetUsd` per query from `src/config.ts`), `limits` (2 issues in flight, 3 review rounds),
`approval` (plan sign-off only `when: "risk == high or steps > 6"`, 4h; merge via PR review),
an edge `group` for the two plan-gate paths, `async: poll` on `request_approval`, and typed
`decision` outputs (route, suite green, review verdict; all `fail: closed`, since an unreadable answer stops the run
or goes back to the coder), and a `sandbox` on each agent with a shell or code tool: the worktree as the filesystem, network `open` (the
container has no egress filter yet; see the optimizer report).

## Layout

```
.claude/agents/   subagent definitions (frontmatter + system prompt)
.claude/settings.json  permissions + shell hooks for interactive sessions
.mcp.json         github, context7, playwright, semgrep
prompts/          templated prompts ({{issue}}, {{plan}}, ...) for non-file agents
src/              pipeline, hooks, tools, memory
src/hooks/        lifecycle + safety hooks (format-lint, bash-guard, secret-scan, context-loader)
src/tools/        delivery tools (run_tests, run_coder, open_pr, osv_scan, request_approval, file_followup)
memory/           learned patterns and run journal
towers/           nested towers for the coder and researcher
```

## Sources

- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) and [hooks](https://code.claude.com/docs/en/agent-sdk/hooks): `query()`, subagents in `options.agents`, hook callbacks.
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (Anthropic, 2024): the routing, prompt chaining, parallelization, orchestrator-workers and evaluator-optimizer patterns named in the table above.
- [OSV.dev API, POST /v1/query](https://google.github.io/osv.dev/post-v1-query/): what `osv_scan` asks; each advisory lists one range per release line, so the fix is read from the range that holds the installed version.
- Barón, Wyrich, Wagner, [An Empirical Validation of Cognitive Complexity as a Measure of Source Code Understandability](https://arxiv.org/abs/2007.12520) (ESEM 2020): the metric of the simplicity rule; the threshold 15 is SonarSource's default, not a finding of the paper.
- Rani et al., [A Decade of Code Comment Quality Assessment: A Systematic Literature Review](https://arxiv.org/abs/2209.08165) (JSS 2023): consistency between comment and code is the comment quality the literature checks most.
- [OpenRouter models API](https://openrouter.ai/api/v1/models): the prices in the mixed-models table (2026-10-10).
- Field numbers: issue #70 of the flow-tower repository; the model choice: the 2026-10-11 benchmark in `skills/flow-tower-costs/reference.md`.
- The rules in `.claude/agents/coder.md` (never rewrite an existing test file) and `verifier.md` (hold a change no test exercises end to end), and the empty-grader rule of the review loop, come from the flow-tower squad's own runs on 2026-10-13 (issues #187-#196).
