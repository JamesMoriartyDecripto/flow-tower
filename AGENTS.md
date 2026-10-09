# AGENTS.md

Flow Tower renders AI agents and multi-agent systems as an interactive 3D tower of flowchart layers, from one `*.tower.yaml` per system. This file is for coding agents (Codex, Pi, Hermes, Cursor, Claude Code, …).

## Using Flow Tower to map YOUR agent system

To generate a tower from a codebase, follow **[docs/generate-a-tower.md](docs/generate-a-tower.md)**: scope → inventory → model layers → write YAML → validate until clean → offer live wiring → report. Never invent components; never copy secrets.

```bash
npm install                                                # once, Node >= 22.12
node bin/flow-tower.js guide                               # print the procedure, with this checkout's paths
node bin/flow-tower.js validate <file.tower.yaml> --json   # loop until no errors and no warnings
node bin/flow-tower.js <file.tower.yaml | dir>             # open it at http://127.0.0.1:5317
node bin/flow-tower.js install-skill --target <claude|codex|pi|hermes|cursor|agents> [--project]
```

Live events from running agents: [docs/realtime.md](docs/realtime.md) and [integrations/](integrations/).

## Working ON flow-tower

Full conventions: [CLAUDE.md](CLAUDE.md). Current handoff: [NEXT.md](NEXT.md). GitHub issues are the source of truth for remaining work.

- English only. Never work on `main`: one branch per feature (`feat/…`, `fix/…`); the user merges.
- Update `CHANGELOG.md` under `[Unreleased]`.
- `npm run check` (typecheck + tests) must pass. Every tower in `examples/` must load with 0 errors and 0 warnings.
- After a schema change: `npm run schema`, then update `docs/schema.md`.
- Keep files under ~400 lines; plain functions over classes; comments explain *why*.
- `/api/events` must answer 204 with an empty body. Do not reintroduce per-node meshes or `<Text>` in the renderer.
- Some environments block shell commands containing `.env`: use `import { env } from 'node:process'` and file-edit tools.
