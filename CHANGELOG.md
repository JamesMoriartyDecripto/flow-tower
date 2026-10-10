# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Security
- The repository is public with `main` protected by a ruleset: pull requests only (no direct or force pushes, no deletion), passing CI, maintainer review through CODEOWNERS. Secret scanning with push protection and Dependabot alerts are on; workflows get a read-only token, and PRs from forks need approval before their workflows run.
- Commit history rewritten to the GitHub noreply address before going public.

### Added
- File viewer: **Wrap** (W) wraps long lines with a hanging indent under the code; Markdown files open **formatted** (V switches to source) with GitHub tables, YAML frontmatter as a small metadata table, links to the node's other files opening in the viewer and external links in a new tab. Rendering is inert: raw HTML is dropped, unsafe URLs removed and remote images never loaded. Both choices are remembered.
- Schema (#31), the gaps the presets hit, all optional and backward compatible:
  - run-wide `budget` / `limits` at the top level (shown in the Layers panel);
  - `budget` as a list, with `amount` + `currency`, `per` (run, item, month...), `for` (model, media...) and unit `rate`;
  - quotas in `limits.rate` (`100/24h`, `300/5m`) and `limits.description`;
  - `trigger.timezone` and `hours`;
  - `approval.when` (conditions such as `refund > 500 EUR`), `per` (per-item), `rounds`, `escalate_to`, `relayed_by`, `via` as a list, and the `dismiss` and `takeover` actions;
  - `fanout.by` as several dimensions, plus `from` and `pick` for supervisor queues;
  - `data`: `biometric` sensitivity, `retention: none`, `retention_after`, `lawful_basis` (GDPR), `disclosure` (C2PA, AI labels);
  - evals with `unit` and `illustrative`;
  - `rollout`: `staged` with `steps`, `metric`, `guard`, `arms`, `sample`;
  - `sla` relative to an event, before one, by a date, in business days, or as an external wait;
  - `async` (poll / callback), `exactly_once`, and typed `decision` outputs (binary / choice / score / ranking, threshold, confidence, pinned model, fail open / closed);
  - agent `skills` and `disabled_tools`;
  - edges with `async`, `group` (alternatives), `version`, the A2A `card`, and the `email` / `manual` protocols;
  - durations in years (`10y`).

  The node panel, markers (`BIO`, `1×`, `POLL`, currency budgets) and edge labels show them; JSON Schema, docs and the skill reference are updated, and the presets use them instead of the old workarounds.
- Tokens and cost per node (#9): Flow Tower accepts OpenTelemetry logs (OTLP/HTTP JSON on `/v1/logs`; `/v1/metrics` and `/v1/traces` are acknowledged). Claude Code's `claude_code.api_request` and Codex's `codex.sse_event` / `codex.turn_cost` become `usage` events on the matching agent node; totals show in the node panel, the live feed header (tower and sub-towers) and the library cards, counted once per project. Ready-made `integrations/claude-code/telemetry.json` and a Codex `[otel]` block; the simulator and the online demo send sample telemetry.
- Export (#15): **P** (or the PNG button) and **X** (or SVG) download a ZIP with every layer of the project as its own image, plus the map of all its layers (laid out like the map view), for the project tower and each sub-tower in nested folders. SVGs are plain and editable, in the active theme's colors (nodes with type, model and runtime tags; edges with kinds, arrows and labels). PNGs are the same drawings at Full HD (fit to 1920×1080, UI fonts embedded); the PNG pack also holds the 3D view as on screen, post-processing included. The buttons show progress. Works in the online demo too.
- Update notice (#35): once a day the local server asks GitHub for the latest release (cached 24 h, 1.5 s timeout, silent on failure). A newer version prints the update command in the terminal and shows a `↑ vX.Y.Z` link to the release notes in the top bar (`/api/version`). Off with `--no-update-check`, `FLOW_TOWER_NO_UPDATE_CHECK=1`, in CI, in the E2E suite and in the static demo; documented in the README (*Privacy and updates*).
- Live demo on GitHub Pages (https://jamesmoriartydecripto.github.io/flow-tower/): `npm run build:demo` freezes the example library and every referenced file into a static site (same sandbox rules as `/api/file`, no local paths), and an in-browser simulator plays live events on the tower on screen (DEMO chip to pause). Deployed by `.github/workflows/pages.yml` with pinned actions.
- Pull request template.

### Fixed
- Node panel connections: long names or labels no longer collapse into a one-letter-wide column (text that looked vertical); they wrap by words next to the kind, and the protocol and layer tags stay whole.
- Claude Code live events (#44, verified with a real `claude -p` session with background and foreground subagents):
  - turns Claude Code injects (subagent reports, task notifications, system reminders, cross-session messages) are logs, not user prompts;
  - background subagents stay lit until `SubagentStop` instead of ending when they are launched;
  - every subagent event carries the `role` (the `description` of the `Agent` call), so several subagents of the same type map to different nodes;
  - `SendMessage` to a finished subagent starts it again;
  - the main session is always `agent: main`, and an empty `agent_type` no longer produces `agent: ""`;
  - a foreground subagent ends once and reports its tokens and duration as a `usage` event.
- `match:` rules support negation: `!field:pattern`.
- Live feed: when the initial load of recent events finished after a newer pushed event, older events were added again (duplicate rows, React key warnings); the initial load now only fills in ids not applied yet, and keeps the feed in order.
- Half-screen windows: the export buttons made the bottom bar run over the legend; below 760 px the layer-spacing slider moves out of the bar (it is still in Settings).

## [0.1.0] - 2026-10-09

First release.

### Added
- Release Auditor preset (`examples/release-auditor`): the pre-release bug sweep of this repository as a tower, with charters, threat model, severity and false-positive rules, finder and verifier prompts, `gates.sh` (tsc, vitest, examples, semgrep, npm audit, gitleaks over the whole history) reporting live to the tower, and an E2E Sweep sub-tower. The v0.1.0 audit report is in `reports/v0.1.0.md`.
- Playwright E2E suite (`npm run e2e`, `e2e/`): one test per example tower driven from the keyboard (layers, node panel, connections, map view, every sub-tower in and out), referenced files served, path traversal refused, live feed, malformed and oversized event bodies, panels at seven screen and interface sizes, axe (WCAG 2 A/AA) on library, HUD and Settings. Fails on any console or page error.
- Every YAML and JSON file under `examples/` must parse (`tests/examples.test.ts`).
- Sales Pipeline (prospect → closed deal → invoice) and Invoicing with Fatture in Cloud (SDI e-invoicing, collections, passive cycle) presets, researched online with sources.
- README demo GIF (and full MP4) plus new screenshots: tower, map, node panel, library.
- Social Media Studio preset (per-platform API quotas, approval gates, comment/DM triage, publisher sub-tower).
- AI Video Studio, Ebook Studio, Mobile App Studio and Marketing Studio presets, each researched online with sources in its README.
- Docs for context engineering: `docs/architecture.md` (which file owns what, read on demand), `examples/README.md` (examples indexed by pattern), load-on-demand maps in CLAUDE.md and AGENTS.md; the skill and the generation guide cover operational fields.
- Ten researched presets for different professions and shapes: SRE incident responder, fraud review desk, deep research team, AI co-scientist, airline customer service, ambient chief of staff, legacy-portal browser worker, A2A purchasing concierge, legal due diligence, website & web design studio (frontend and backend sub-towers), plus a Jev decision-layer harness. Each has real files, sources in its README and uses the operational fields.
- Schema: operational fields on agents and nodes (inherited by nodes): `trigger`, `approval`, `budget`, `limits`, `fanout`, `data`, `evals`, `version`, `rollout`, `sla`, `credentials`, `sandbox`; edge `protocol` (mcp, a2a, http, grpc, webhook, queue, event, stdio); `recording` resource kind. Shown as node markers (×N, PII, WEBHOOK, ≤15m, $2), ghost outlines for fan-out, protocol on edge labels, and Operations / Data / Evals sections in the node panel. Search matches triggers, sensitivity, region and version.
- Settings → Text: interface size (80–160%, scales panels and text together, capped automatically so panels still fit the window), text font (HUD / system) and title font (Orbitron / same as text).
- Starter examples (1–3 layers, short YAML): single agent, RAG bot, PR review bot, personal voice assistant.
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
- `examples/game-studio`: AI game development studio (14 layers, 141 nodes, 8 nested towers, depth 2).
- `runtimes` registry, per-node `runtime`, `resources` (logs, scripts, dashboards, endpoints) and `status` (planned / experimental / deprecated).
- Library mode: CLI accepts directories and multiple entries; project gallery with tags, stats and health.
- Batched renderer (instancing, batched lines, troika BatchedText), distance-based text LOD, quality presets.
- Large log files are previewed by their tail.
- `scripts/gen-stress.ts` synthetic tower generator for performance testing.
- `examples/course-studio`: course creation studio (12 layers, 109 nodes, 5 nested towers) with researched references.
- Search results ranked by relevance (label > id > model/tools/runtime > description).

### Security
- Release audit (see `examples/release-auditor/reports/v0.1.0.md`): semgrep (javascript, typescript, react, nodejs, secrets) clean after one false positive, npm audit 0 vulnerabilities, gitleaks over the whole git history: no leaks.
- semgrep (javascript, typescript, react, nodejs, python, secrets rulesets): no findings; two loopback `http://127.0.0.1` fetches in `integrations/` annotated as intentional.
- Tower files can only read inside their project (the git repository that contains them, or the opened folder): prompt `file:`, agent `from:`, nested `tower:`, `files`, resources and symlinks pointing outside are refused with an error, and `root:` cannot leave the project. Before, a tower from a cloned repository could pull any local file (e.g. `~/.ssh`) into the workspace and the node panel, and `root: /` widened the `/api/file` sandbox to the whole disk.
- The Claude Code SessionStart hook runs `flow-tower emit` instead of `npx flow-tower emit`: the package name is not published, so npx would have fetched whatever package claims it. Docs and example READMEs no longer suggest `npx flow-tower`.
- `POST /api/events` refuses batches over 1000 events (413): each event is matched against every node, and a huge batch stalled the dev server.

### Changed
- Library cards are plain containers with one primary button (the title), so the Tower / Map buttons are no longer nested inside a button; descriptions are focusable and scroll with ↑ ↓.
- Dialogs (Settings, Shortcuts, file viewer) are modal for the keyboard: focus moves in on open, Tab stays inside, and focus returns to where it was on close. Shortcuts scrolls with ↑ ↓ PageDown on short screens.
- Legend entries are focusable. Tooltips also appear on keyboard focus; the stripped `title` stays available to screen readers. Settings sliders and switches are named after their row. Layers panel entries preview their layer on focus as on hover. Live feed messages show their full text on hover.
- File viewer: ← → switch files and ↑ ↓ PageUp PageDown Home End scroll the code from anywhere in the viewer.
- `prefers-reduced-motion` turns off HUD animations; the smallest labels never render below ~7 px at the 0.7× interface floor.
- README trimmed: examples summarized with a link to the full index; NEXT.md and CONTRIBUTING.md refreshed.
- Glow only where it matters: static structure stays below the bloom threshold; selection, hover, focused layer and live activity glow. Cheaper bloom.
- Focused layer gets a near-opaque plate and the other layers dim further, so the focused flow reads cleanly.

### Fixed
- Found by the release audit (each with a regression test in `tests/` or `e2e/`):
  - Two towers that reference each other no longer vanish from the library (the app showed "no tower files found").
  - A number in agent frontmatter (`name: 2025`) no longer breaks every live event POST and the search.
  - Backspace out of a sub-tower shared by several nodes lands on the node you entered from, not the first one.
  - The runtime spotlight of a sub-tower no longer dims the whole parent tower after going back up.
  - A live reload that removes the selected node or the focused layer clears the selection instead of dimming everything.
  - Clicking the current tower in the breadcrumb keeps the selection.
  - Arrows still move when the selected node's type is hidden in the legend.
  - Shift+C without a previous jump goes to the last connection, not the second to last.
  - The B / "Back to …" trail is per tower (node keys repeat across towers).
  - Esc with the pointer on a connection row no longer leaves its hover highlight stuck.
  - `/` no longer focuses the top-bar search behind Settings, Shortcuts, the file viewer or the library.
  - Live events land on towers whose path contains `#`.
  - Live feed and inspector no longer overlap in half-screen windows; the Issues panel stays above the live feed.
  - Focus rings of full-width rows (feed, files, connections) are no longer clipped.
  - Six example data files were invalid YAML (unquoted `[slug]`, `: ` inside plain scalars, flow sequences as keys); two missing figures of the ebook sample were added; Markdown tables and links fixed across the docs.
- Performance, found by the release audit:
  - Hovering or selecting a node no longer rebuilds every line batch and relinks the line shader (game-studio, 11 hovers: shader links 48 → 4, buffer uploads 6,488 → ~320).
  - Live events are matched with compiled patterns (41 ms → 1.4 ms per event on the 1,769-node examples library).
  - Events that land on no node no longer keep the visible tower rendering for 1.7 s each.
  - The file watcher no longer adds a listener per path on every reload.
  - Layer grid geometries are disposed on tower switch and theme change (GPU memory grew with each switch).
  - The library re-renders only the card whose live state changed.
  - Idle costs nothing: live polling, the closed live feed and the tooltip watchdog no longer wake up while nothing is live or shown.
  - A live reload keeps unchanged towers as they are, so the tower on screen is not laid out again when another file changes.
- Creating a file that a tower references (and was missing) now reloads the library, so its warning disappears without touching the YAML.
- Library tag bar shows the 12 most used tags with counts and a toggle for the rest (100+ tags filled the screen).
- HUD corner brackets no longer scroll with the content of scrolling panels (legend, layers, issues, shortcuts).
- Camera framing respects the HUD (#30): the projection is centered on the free area between panels (setViewOffset), framings fit that area, opening the inspector or the live feed slides the scene instead of covering it, and a node selected under a panel is brought into view with the smallest camera move. When panels open or close, the camera zooms out only as much as needed for the visible nodes to fit, and returns to the previous distance when they fit again.
- vitest only runs `tests/`: sample `*.spec.ts` files inside examples are content, not project tests.
- Library: project descriptions are no longer cut; up to 4 lines, longer ones scroll inside the card.
- Schema docs: labeled edge shorthand (`a -> b: label`) must be quoted in YAML.
- Node titles and subtitles no longer spill out of the node: width-aware truncation (whole subtitle parts) plus a clip at the node border.
- Crash when returning to a parent tower with a layer focused (stale scene used the new focus index).
- Library arrows now work wherever the focus is (and wrap left/right); T / M open the focused card as tower / map.
- Choosing Tower or Map now sticks: sub-towers and other projects open in the same view (saved as the default view).
- HUD audit (1440×900 and 1280×720): controls hint no longer overlaps the legend, legend tabs no longer wrap, narrower feed/inspector on small screens, tooltips no longer linger after their panel closes, canvas redraws after a window resize.
- Plates now occlude the layers below in proportion to their opacity (stack-aware draw order).
- Esc did nothing in the library (focus in the filter) and with a slider focused; pressing L typed an "l" into the library filter.
- Live mode update loop (useSyncExternalStore tearing on an in-place-mutated store) and a dashed line that recompiled its shader on every render.
- Inspector and HUD text overlaps: chips under the close button, long table keys, validation panel over the inspector, layer list over the legend.

[Unreleased]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/JamesMoriartyDecripto/flow-tower/releases/tag/v0.1.0
