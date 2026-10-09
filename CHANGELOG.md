# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Realtime: `POST /api/events` ingest with adapters for Claude Code hooks, Claude Agent SDK, Pi and Hermes Agent; node matching by agent/tool names or `match:` rules; live node beams/halos, error flashes, Live feed panel, per-node live info in the inspector.
- `flow-tower emit` command (stdin payloads from hooks, or flags for scripts) and `integrations/` configs.
- `npm run simulate` replays a plausible multi-walker run against any tower.

- Layer lens: hovering a layer (or its entry in the Layers panel) magnifies it and its neighbours, spreads the stack around it and dims the rest; clicking an empty plate focuses the layer. Cross-layer links follow the animation.
- 3D tower renderer (three.js / react-three-fiber): stacked glass layers, left-to-right flowcharts laid out with ELK, animated flow particles, bloom, scanner and arc-reactor base.
- YAML tower format (`*.tower.yaml`) validated with zod, plus generated JSON Schema for editor autocomplete.
- Registries for `prompts` and `agents`; `from:` import of Claude Code agent files (`.claude/agents/*.md`).
- Nested towers (`tower:`) with drill-down navigation and breadcrumb.
- Typed edges (`flow`, `call`, `spawn`, `handoff`, `return`, `data`) with shorthand syntax `a -> b [kind]: label`; cross-layer `links`.
- Inspector (overview, harness, connections, system prompt with `{{vars}}`, tools, files) and syntax-highlighted file viewer.
- Search, node-type filters, upstream/downstream path highlighting, layer focus, explode control, keyboard shortcuts.
- Validation panel (errors, warnings, info) and live reload on any referenced file change.
- `flow-tower` CLI with `init` starter template; read-only file API sandboxed to the tower root.
- `examples/dev-squad`: multi-agent software delivery system on the Claude Agent SDK with two nested towers.
- `examples/game-studio`: AI game development studio (14 layers, 140 nodes, 7 nested towers, depth 2).
- `runtimes` registry, per-node `runtime`, `resources` (logs, scripts, dashboards, endpoints) and `status` (planned / experimental / deprecated).
- Library mode: CLI accepts directories and multiple entries; project gallery with tags, stats and health.
- Batched renderer (instancing, batched lines, troika BatchedText), distance-based text LOD, quality presets.
- Large log files are previewed by their tail.
- `scripts/gen-stress.ts` synthetic tower generator for performance testing.
- `examples/course-studio`: course creation studio (12 layers, 109 nodes, 5 nested towers) with researched references.
- Search results ranked by relevance (label > id > model/tools/runtime > description).

### Fixed
- Inspector and HUD text overlaps: chips under the close button, long table keys, validation panel over the inspector, layer list over the legend.
