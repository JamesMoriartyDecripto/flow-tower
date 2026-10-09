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
| Human in the loop | `src/tools/request-approval.ts`, draft PRs, merge denied |
| Lifecycle hooks | `src/hooks/` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) |
| Least-privilege subagents | `.claude/agents/*.md` |
| Memory | `CLAUDE.md`, `memory/patterns.md`, `memory/session-log.md` |

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
