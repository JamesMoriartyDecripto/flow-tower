# Flow Tower

**See the whole structure of an agentic system at once.** Flow Tower renders AI agents and multi-agent systems as an interactive 3D tower. Each layer is a left-to-right flowchart. Click any node to open its system prompt, tools, model, harness settings, files, logs and the services it runs on.

![Forge Studio tower](docs/screenshot-tower.png)

- **One YAML file per system.** It is easy to write and review, and it lives in the same repo as the agent.
- **Tower of layers.** Stack layers like intake, orchestration, specialists, tools, guardrails, memory and models. Cross-layer links show who calls whom.
- **Nested towers.** An agent can contain its own tower. Double-click it to dive in, as deep as you need.
- **Real files.** Prompts, code, configs and logs open in a syntax-highlighted viewer. Existing Claude Code agents (`.claude/agents/*.md`) import as they are.
- **Hybrid deployments.** `runtimes` show what runs on a laptop, a server, a CI job or a third-party service.
- **Structural changes.** Mark nodes `planned`, `experimental` or `deprecated`.
- **Library.** Point it at a folder and browse every project you work on.
- **Live.** Save the YAML, or any referenced file, and the tower updates.

![Library](docs/screenshot-library.png)

## Quick start

```bash
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git
cd flow-tower && npm install
npm run dev                                  # library of the bundled examples
node bin/flow-tower.js path/to/agent.tower.yaml
node bin/flow-tower.js ~/projects            # every *.tower.yaml found, as a library
node bin/flow-tower.js init my-agent.tower.yaml   # starter file
```

Requires Node 22.12 or newer. The app runs locally on `127.0.0.1`. Nothing is uploaded.

## A tower in 30 lines

```yaml
# yaml-language-server: $schema=./schema/flow-tower.schema.json
name: Research Agent
runtimes:
  laptop: { kind: local }
  search: { kind: saas, provider: brave }
prompts:
  main: { file: prompts/main.md }
agents:
  lead: { model: claude-opus-5-5, prompt: main, tools: [web_search], runtime: laptop }
  critic: { from: .claude/agents/critic.md }
layers:
  - id: loop
    title: Agent Loop
    nodes:
      - { id: ask, type: entry, label: User question }
      - { id: lead, agent: lead }
      - { id: review, agent: critic }
      - { id: ok, type: decision, label: Good enough? }
      - { id: answer, type: output, label: Answer }
    edges:
      - ask -> lead
      - lead -> review [handoff]
      - review -> ok
      - "ok -> lead [return]: no, max 3"
      - "ok -> answer: yes"
  - id: tools
    title: Tools
    nodes:
      - { id: web_search, type: tool, label: Web search, runtime: search }
links:
  - loop.lead -> tools.web_search [call]
```

See the full **[schema reference](docs/schema.md)**. A generated JSON Schema (`schema/flow-tower.schema.json`) gives autocomplete in VS Code.

## Examples

| Preset | What it shows |
|---|---|
| [`dev-squad`](examples/dev-squad) | Software delivery on the Claude Agent SDK: triage, orchestrator-workers, review loop, hooks, MCP, memory |
| [`game-studio`](examples/game-studio) | AI game studio: design, concept art, Blender, Unreal, world generation, code review, QA bots, marketing. 140 nodes, nesting depth 2 |
| [`course-studio`](examples/course-studio) | Course creation: instructional design, parallel module writers, assessment, review board, SCORM/LMS publishing |

Every example ships real prompt, agent, code, config and log files, so the popups have something to show.

## Controls

| Input | Action |
|---|---|
| Drag / right-drag / scroll | Rotate / pan / zoom |
| Click node | Inspect it and highlight its upstream and downstream paths |
| Double-click node, or **Enter** | Enter its sub-tower |
| **1–9**, **0** | Focus a layer / overview |
| **Esc**, **Backspace** | Go back (file, then selection, then layer, then parent tower) |
| **/** | Search nodes, models, tools |
| **L** | Project library |

The bottom bar toggles orbit, flow particles and the rendering quality (`high` / `balanced` / `low`). You can also force a preset with `?quality=low`.

## Performance

Each layer is drawn in a handful of draw calls: instanced meshes, batched lines and troika `BatchedText`. Labels you couldn't read at the current zoom are skipped. Measured on a 2017 Radeon Pro 570 at 1440×900 with `balanced` quality:

| Tower | Nodes | FPS |
|---|---|---|
| dev-squad | 56 | 50–55 |
| course-studio | 109 | 60 (vsync) |
| game-studio | 141 | 60 (vsync) |
| synthetic 30 × 20 (`npm run stress -- 30 20`) | 600 | 19–29 (`low`) |

## Project layout

```
bin/            CLI
src/core/       schema (zod), YAML loader, validation — shared by server and app
src/server/     Vite plugin: /api/workspace, /api/file (read-only, sandboxed), live reload
src/app/        React + three.js app: scene/ (3D) and hud/ (overlay UI)
schema/         generated JSON Schema
examples/       reference towers
scripts/        schema and stress-tower generators
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please report security issues privately ([SECURITY.md](SECURITY.md)).

## License

[MIT](LICENSE)
