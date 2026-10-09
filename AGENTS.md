# AGENTS.md

Flow Tower renders AI agents and multi-agent systems as an interactive 3D tower of flowchart layers, from one `*.tower.yaml` per system. This file is for coding agents (Codex, Pi, Hermes, Cursor, Claude Code, …). Keep it in context; open the linked files only when the task needs them.

## Using Flow Tower to map YOUR agent system

Follow **[docs/generate-a-tower.md](docs/generate-a-tower.md)**: scope → inventory → model layers → write YAML → validate until clean → offer live wiring → report. Never invent components; never copy secrets. Start from the closest example in **[examples/README.md](examples/README.md)**.

```bash
npm install                                                # once, Node >= 22.12
node bin/flow-tower.js guide                               # print the procedure, with this checkout's paths
node bin/flow-tower.js validate <file.tower.yaml> --json   # loop until no errors and no warnings
node bin/flow-tower.js <file.tower.yaml | dir>             # open it at http://127.0.0.1:5317
node bin/flow-tower.js install-skill --target <claude|codex|pi|hermes|cursor|agents> [--project]
```

| Need | Open |
|---|---|
| Every YAML field, incl. operations (trigger, approval, budget, limits, fanout, data, evals, rollout, sla, credentials, sandbox) | [docs/schema.md](docs/schema.md) |
| Compact cheat sheet and per-framework signals | [skills/flow-tower/reference.md](skills/flow-tower/reference.md) |
| Live events from running agents | [docs/realtime.md](docs/realtime.md), [integrations/](integrations/) |

## Working ON flow-tower

Conventions and gotchas: [CLAUDE.md](CLAUDE.md). Code map: [docs/architecture.md](docs/architecture.md). Handoff: [NEXT.md](NEXT.md). GitHub issues are the source of truth.

- English only. Never work on `main`: one branch per feature (`feat/…`, `fix/…`).
- `npm run check` (typecheck + tests) must pass; every tower in `examples/` loads with 0 errors and 0 warnings. UI changes: `npm run e2e`.
- Schema change: `npm run schema`, then docs/schema.md and the skill reference. Update `CHANGELOG.md` under `[Unreleased]`.
- Files under ~400 lines; plain functions over classes; comments explain *why*.
