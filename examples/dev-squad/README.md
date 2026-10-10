# Dev Squad

A multi-agent **software delivery system** built on the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) (TypeScript).
Label a GitHub issue `squad:go` and Dev Squad triages it, plans, researches, codes,
tests, reviews, verifies and opens a **draft** pull request. A human merges.

This is the flagship flow-tower example: it is meant to be read, not run.

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
| Cross-model review | `src/config.ts` (`ROLE_MODEL`), `src/openrouter-agent.ts` (DeepSeek codes, GLM reviews, Claude verifies) |
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

## Mixed models

The maintainer runs the squad with mixed models (`ROLE_MODEL` in `src/config.ts`). Claude plans,
arbitrates and verifies; cheaper models from other families code and review through
[OpenRouter](https://openrouter.ai), so the reviewer never shares the coder's blind spots.

| Role | Provider | Model | $ in / out per M tokens |
|---|---|---|---|
| Lead, architect, fresh verifier, last-round fixer | Claude Agent SDK | `claude-opus-5-5` | Claude account |
| Coder | OpenRouter | `deepseek/deepseek-v4.1-flash` | 0.30 / 1.20 |
| Reviewer (read-only) | OpenRouter | `z-ai/glm-5.3-flashx` | 0.37 / 1.25 |
| Security auditor (read-only) | OpenRouter | `deepseek/deepseek-v4.1-flash` | 0.30 / 1.20 |
| Researcher, tester / triage, doc-writer | Claude Agent SDK | Sonnet 5.5 / Haiku 5.5 | Claude account |

Prices as of 2026-10-10, from `https://openrouter.ai/api/v1/models`. Field numbers from issue #70
of the flow-tower repo: coder round 1, 50 steps, $0.13, 231 tests green; reviewer 6 steps, $0.085, one
blocking bug found; security auditor 9 steps, $0.06. Full GLM 5.3 was tried first as the reviewer: it
reasoned 1-2.5 min per step and timed out at step 9 ($0.24), so the squad uses its FlashX variant.

The OpenRouter roles run in `src/openrouter-agent.ts`, an OpenAI-style tool loop (sample code: the
real runner is session tooling outside this repo). Claude Code hooks do not run there, so the fences
are in code: read tools for every role, `edit_file` / `write_file` for the coder only and only under
`src/`, `tests/`, `e2e/`, a command whitelist instead of a shell, a secret-path deny list, low reasoning effort,
a `session_id` per run (OpenRouter keeps it on the provider that holds its prompt cache), a step and
dollar cap, and a live tower event per tool call. SDK subagents are Claude only, so the lead reaches
the coder through the `run_coder` tool (`src/tools/run-coder.ts`).

## Operational fields used

Top-level `budget` ($15 per issue run) and `limits` (4 concurrent subagents), agent `budget`
(`maxBudgetUsd` per query from `src/config.ts`), `limits` (2 issues in flight, 3 review rounds),
`approval` (plan sign-off only `when: "risk == high or steps > 6"`, 4h; merge via PR review),
an edge `group` for the two plan-gate paths, `async: poll` on `request_approval`, and typed
`decision` outputs (route, suite green, review verdict).

## Layout

```
.claude/agents/   subagent definitions (frontmatter + system prompt)
.claude/settings.json  permissions + shell hooks for interactive sessions
.mcp.json         github, context7, playwright, semgrep
prompts/          templated prompts ({{issue}}, {{plan}}, ...) for non-file agents
src/              pipeline, hooks, tools, memory
memory/           learned patterns and run journal
towers/           nested towers for the coder and researcher
```
