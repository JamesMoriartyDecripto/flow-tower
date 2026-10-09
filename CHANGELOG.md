# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Node panel: connections split into "Across layers" (with the target layer) and "In this layer"; click or Enter jumps there and moves the camera, hover highlights the target, "Back to …" (B) undoes a jump, C / Shift+C cycle connected nodes.
- Keyboard inside panels: Enter / I enters the node panel, ↑ ↓ Home End walk sections and buttons, ← → switch tabs (or move along a row), Esc returns to the scene; the file viewer takes and gives back the focus.
- Sub-towers by keyboard: S / Shift+S select the next / previous sub-tower node, Enter dives in, Backspace returns onto the node you entered from, Shift+Backspace to the project root.
- Full keyboard control: arrows move spatially between nodes and across layers, PgUp/PgDn layers, Shift/Alt+arrows and +/− for the camera, [ ] inspector tabs, F live feed, O auto-orbit, ? shortcuts overlay, visible focus ring, Settings focused on open.
- Library: sort by recent / name / size / live, keyboard navigation (arrows, Enter), Tower / Map buttons per card, tags, runtime mix, last-modified time, live project count, "open" badge on the current project.
- Settings → Animations: style (dots, comets, pulses), size, speed and density for flows between nodes and between layers; Visible by default: edge labels, node subtitles, links, grid, frame, base, scanner, sparkles.
- Sub-towers are easy to find: bigger stacked-plates badge, `⇣ SUB` in node subtitles, a Sub-towers list in the Layers panel (select / enter), a SUB-TOWER chip in the inspector and a legend key.
- Layer transparency slider in Settings (the focused layer always stays nearly opaque).
- A description on every button, shown in a HUD-styled tooltip.
- Settings page (⚙ or `,`): themes (Mark, Arc reactor, Stealth, Ember, Verdant, each with a matching live palette), quality, ambient animations, particles, glow strength, default view (auto = map above 10 layers), layer spacing, auto-orbit, spotlight, follow, live chips, controls hint; saved per browser.
- Map view: layers laid out side by side and seen from above (Tower / Map switch, `M`, `?view=map`).
- `flow-tower emit` streams JSONL from stdin live (batches every 250 ms), so `codex exec --json` and `pi --mode json` show up in real time.
- Harness-neutral tower generation: `docs/generate-a-tower.md` procedure, root `AGENTS.md`, `flow-tower guide`, and `install-skill --target claude|codex|pi|hermes|cursor|agents [--project]` (Agent Skills folders, ships `procedure.md`).
- Live events from OpenAI Codex: `codex` adapter for hooks, `codex exec --json` streams and the legacy `notify` payload; `integrations/codex/`.
- On-demand rendering with an FPS budget: `eco` (20 fps cap, no post-processing, 0 renders when idle), `balanced` (30 fps), `high` (60 fps); 10 fps and no decorative motion while the window is unfocused.
- Live palette (cyan running, green done, red error), live chips above active nodes, per-layer live badges, library live dots, sub-tower activity on parent nodes.
- Live feed: Starts/Errors filters, Tower/Library scope, Spotlight, Follow (camera follows activity), Pause, jump to nodes in any tower.
- Pan with Shift + left drag and with Shift + two-finger trackpad scroll (pinch still zooms).
- Claude Code skill (`skills/flow-tower`) that inventories an agentic codebase and writes a validated tower; `flow-tower install-skill [--project]`.
- `flow-tower validate <files|dirs> [--json]` (exit 1 on errors), usable in CI.
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

### Changed
- Glow only where it matters: static structure stays below the bloom threshold; selection, hover, focused layer and live activity glow. Cheaper bloom.
- Focused layer gets a near-opaque plate and the other layers dim further, so the focused flow reads cleanly.

### Fixed
- Node titles and subtitles no longer spill out of the node: width-aware truncation (whole subtitle parts) plus a clip at the node border.
- Crash when returning to a parent tower with a layer focused (stale scene used the new focus index).
- Library arrows now work wherever the focus is (and wrap left/right); T / M open the focused card as tower / map.
- Choosing Tower or Map now sticks: sub-towers and other projects open in the same view (saved as the default view).
- HUD audit (1440×900 and 1280×720): controls hint no longer overlaps the legend, legend tabs no longer wrap, narrower feed/inspector on small screens, tooltips no longer linger after their panel closes, canvas redraws after a window resize.
- Plates now occlude the layers below in proportion to their opacity (stack-aware draw order).
- Esc did nothing in the library (focus in the filter) and with a slider focused; pressing L typed an "l" into the library filter.
- Live mode update loop (useSyncExternalStore tearing on an in-place-mutated store) and a dashed line that recompiled its shader on every render.
- Inspector and HUD text overlaps: chips under the close button, long table keys, validation panel over the inspector, layer list over the legend.

### Security
- semgrep (javascript, typescript, react, nodejs, python, secrets rulesets): no findings; two loopback `http://127.0.0.1` fetches in `integrations/` annotated as intentional.
