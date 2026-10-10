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
| Orchestrator-workers | `src/orchestrator.ts` (`query()` with `options.agents`) |
| Parallelization | researcher tracks; reviewer + security auditor in `Promise.all` |
| Evaluator-optimizer (max 3 rounds) | `src/loop/review-loop.ts` |
| Prompt chaining with gates | `src/pipeline.ts` |
| Fresh-context verifier | `src/loop/verify.ts` |
| Human in the loop | `src/tools/request-approval.ts` + `src/loop/await-approval.ts` (the lead ends its session, the pipeline polls and resumes it), draft PRs, merge denied |
| Failure path | `src/pipeline.ts`: any throw or the $15 issue budget comments on the issue and logs the run |
| Lifecycle hooks | `src/hooks/` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) |
| Least-privilege subagents | `.claude/agents/*.md` |
| Memory | `CLAUDE.md`, `memory/patterns.md`, `memory/session-log.md` |

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
