# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- `dev-squad` example, from a field run on #68: personal data counts as a sensitive area (a full route in a sensitive area gets risk high, so its plan needs a human sign-off), and the maintainer can approve a plan with changes (`/squad approve <notes>`); parts moved out of scope become follow-up issues through the new `file_followup` tool.
- Voice journal and self-improvement (#68). Opt-in, text only, never audio: each turn records what was heard, what happened and how it went. Outcomes are corrected from what you do next ("no, …" = corrected, "back" right after = undone, stopping a reply with Esc or by voice = interrupted). After 20 new turns a review runs when the microphone turns off (about a cent with the default model): an LLM proposes aliases for misheard names (only real names on screen), rules for the agent and reply style. Nothing applies until accepted. Accepted aliases rewrite the transcript before the parser and the agent; accepted notes join the agent's prompt. The caption shows how many suggestions wait.
- Settings → Voice → Learning: the journal toggle, last-7-days stats (turns, not understood, corrected, interrupted, answer time, cost), suggestions to accept or reject, what was learned (removable one by one), **Review now** and **Forget everything**.
- E2E of the voice path (`e2e/voice.spec.ts`): transcripts go in through `__flowTower.hear()`, OpenRouter is answered by route interception (no cost), and the journal goes to a temporary `FLOW_TOWER_HOME`.

### Fixed
- Voice no longer answers itself through laptop speakers (#72). Half-duplex by default: a clip recorded while a reply plays, or within 700 ms after, is dropped before transcription (no cost, no loop). **Settings → Voice → Interrupt by voice** (off by default, for headphones) brings barge-in back. The echo filter judges a clip by when it was recorded, not when its transcript returns. Esc stops a reply first and keeps the mic on; V and ✕ stop it too.
- A laptop fan no longer opens clips by itself (#73). Speech is detected on the 300–3400 Hz spectrum, divided bin by bin by a noise floor measured 200–700 ms after the mic opens: a voice is louder than the floor and peaky, a fan is flat. **Settings → Voice → Microphone sensitivity** (Low for noisy laptops, Normal, High for quiet rooms). Transcripts that are only Whisper's noise text ("Grazie.", "Thank you.", subtitle credits) are dropped.
- Voice robustness (#74): spoken replies are synthesized one or two sentences ahead, not all at once, and a 429 is retried once, so long replies no longer lose sentences; a chat stream that fails after its headers ends cleanly; a review reads the oldest 200 new entries first, so none are skipped; aliases on short or common words ("il", "the", "open") are refused; the suggestions chip shows right after a review at mic off; the 7-day stats show % undone.
- Voice review round (#68): Esc while a reply is still being written silences the whole turn and journals it *interrupted*; one "speaking" state (from the first sentence until the last one plays) drives the caption, Esc and the half-duplex gate; a command spoken in the 700 ms after a reply shows once "Wait a moment after the reply, or press Esc to interrupt it."; calibration keeps the per-bin minimum, so speech in the first 0.7 s is no longer learned as noise; aliases that are part of a real name are refused and never rewrite inside a name; commands starting with "non …" ("non mostrare…") are no longer taken as corrections; a failed audio sentence cannot leave the mic deaf.
- Voice review round 2 (#68): Esc while a reply is still being written also stops the turn's tool calls, so nothing moves the view after it, and the caption says "Stopped"; a sentence whose speech takes over 8 s is skipped, and a reply the browser refuses to play (autoplay blocked) ends at once, so the mic is never left deaf; with Interrupt by voice on, only clips over audio actually coming out of the speakers go through the barge-in rule, so a command spoken while the first sentence is still being synthesized is handled normally; one automatic review runs at a time, and a failed one waits for 20 more turns (it may have been paid); calibration keeps a ×1.5 margin over the measured minimum, so a fan wobbling just above it does not open clips; corrections that Whisper opens with quotes or punctuation («No, quello») are recognized.

### Security
- The user's own data lives outside the repo, in `~/.config/flow-tower` (or `FLOW_TOWER_HOME`): the key file, the voice journal and the voice memory, created readable by the owner only. `OPENROUTER_API_KEY` is read from the environment, then the user folder, then the git-ignored `.env` in the flow-tower folder (a fallback). Nothing personal is written in the repo.
- `/api/file` never serves the user folder, even when a tower root contains it.
- GETs under `/api/voice` refuse cross-site requests: the journal stats and the voice memory are personal.
- The tower loader no longer reads secret files (key and credential files, `.ssh`, `.git`…) or the user folder: a prompt `file:`, agent `from:` or nested tower pointing at one gets the error "is a secret file or in the user folder (~/.config/flow-tower): not read". One guard, `src/core/secrets.ts`, shared with `/api/file`.
- Symlinks cannot leak the user folder through the loader: a tower file is checked by its real path before it is read (a repository could ship `x.tower.yaml` linked to the voice journal, and YAML errors quote the lines they fail on), folder scans skip links that leave the scanned folder or enter the user folder, a referenced file that is secret or in the user folder is refused without checking whether it exists, and the startup warning about `FLOW_TOWER_HOME` inside the flow-tower folder follows symlinks.
- Accepted voice notes are capped at 20 and 2000 characters (409 past the cap) and reach the agent as preferences that never override its instructions, the tool results or the screen. The default user folder is 0700 (a `FLOW_TOWER_HOME` folder that already exists keeps its permissions; the files are 0600 either way), whole-file writes are atomic and leave no temp file behind, journal times are clamped, and the server warns at startup when `FLOW_TOWER_HOME` is inside the flow-tower folder.

## [0.4.0] - 2026-10-10

### Added
- Voice agent (#63): ask about the tower on screen ("cosa c'è nel secondo livello?", "what is the triage connected to?", "open the first file") and it answers out loud in your language, focusing, selecting, highlighting and opening what it talks about. An LLM (default `google/gemini-3.1-flash-lite`) with twelve tools that read and act on the tower in the page; replies spoken by OpenRouter text-to-speech (default `elevenlabs/eleven-flash-v2.5`, one multilingual voice); barge-in; echo filter. Plain commands stay instant with the local parser. Settings → Voice → Spoken replies.
- Voice language in Settings (Auto, Italiano, English), sent to transcription as a hint; command words forgive one misheard letter and more Italian verbs are understood (aprimi, portami, vediamo, andiamo…).
- Node list: with a layer focused and no node selected, a panel on the right lists the layer's nodes in flow order (type tag, name, sub-tower, live state). The names stay readable however small or far the cards are; a click selects the node and the inspector takes its place.
- Voice commands (#62): press V or the MIC button (top bar, library header) and speak, in Italian or English, to open a project, focus a layer by number or name, select a node or agent, switch to map or tower view, go to the overview, go back, open the library or turn the microphone off. Clips end after ~0.6 s of silence and are transcribed by OpenRouter (`openai/whisper-large-v3-turbo`, override with `FLOW_TOWER_VOICE_MODEL`); commands are matched locally against the names on screen, tolerate misheard words, and offer a numbered choice when a name is ambiguous. A caption under the top bar shows what was heard and done. Listening stops after 2 minutes without a command. Needs `OPENROUTER_API_KEY`; not available in the static demo.
- `voice-commands` example: the tower of the voice widget itself, with the speech engines it weighed (Web Speech on-device and cloud, Whisper in the browser, OpenRouter) and a planned LLM intent step.
- `db-api-playbook` example: how to build and run an HTTP API over a database (approach, contract, data access, security, shipping, operations), with a request-pipeline sub-tower and notes pages citing current standards (OWASP API Top 10 2023, OpenAPI 3.2, RFC 9457, RFC 9700, RFC 9745), checked on 2026-10-10.
- `validate` warns about node labels the card cuts (over 18 characters, 13 on a node with a nested tower) (#56).
- Deep links: `?tower=…&layer=…&node=…` opens a tower (nested ones too), focuses a layer or selects a node (#7).
- `--browser <app>` opens the page in another browser; `$BROWSER` works too (#56).
- `approval.description`, like the other operation fields; shown in the node panel.
- Skill and docs: a "Verify against the code" step after validate (prove each edge, list every exit, trace a run per entry point, fresh-context reviewers for big systems); read rule docs, agent bodies and hook code in full; classify hooks from their code; record source conflicts; towers in the mapped system's language; a "Services without agents" guide for HTTP APIs and workers; guidance from two evaluation runs (dev-squad without its tower, langchain-ai/open_deep_research): LangGraph `Command` routing and subgraphs, attempts vs retries, orchestrator hubs, pipeline failures, hook wiring, a reviewer prompt (#56, #7).

### Changed
- `validate` errors point at the fix: a value that fits no form of a field names the missing part (`fanout.max: required field missing`, not `Invalid input`), and YAML errors from an unquoted `: ` or comma say to quote the value (#56). Schema errors name layers and nodes by id (`review.gate.approval`), not by index (`layers.6.nodes.3.approval`).
- Examples: 78 node labels that the card cut are shorter; exact identifiers moved to the description.

### Fixed
- Two flow-tower servers started from the same checkout (a second `--port`, or the e2e server next to a dev server) no longer break each other: each port has its own Vite dependency cache. Before, an open page could fail with "error loading dynamically imported module".
- `dev-squad` example: the sample code now does what its tower shows, and the tower shows what the code does (found by the #7 evaluation run). The lead can request plan approval and the pipeline polls and resumes it; `open_pr`, `run_tests` and `request_approval` run in the issue worktree, not the process directory; any throw or the $15 issue budget comments on the issue and logs the run (new "Run stopped" output); a red suite or an unmet criterion holds the verifier; a review round passes on blocking findings only; the `squad:skip` opt-out wins over the policy upgrade; the reviewer's bash guard and the area rules reach `runAgent` sessions; headless runs deny `ask` permissions explicitly; quick fixes get a CHANGELOG entry and PR body; bad webhook JSON gets a 400; the unused Redis queue and the serverless receiver are gone (the receiver runs in the container); sample logs match the code.

### Security
- Voice commands (#62): `OPENROUTER_API_KEY` stays on the local server (read from the environment or from the `.env` file in the flow-tower folder, which is git-ignored) and never reaches the page; `GET /api/voice` only says whether a key is set. Transcription requests ask OpenRouter for zero data retention (`provider.zdr`; `FLOW_TOWER_VOICE_ZDR=0` turns it off). `/api/voice` only answers this app's page: an exact `application/json` content type, no cross-site `Origin` / `Sec-Fetch-Site`, and the page's own `x-flow-tower-voice` header; the body is capped at 2 MB and at most 2 transcriptions run at once.
- `/api/events` and the OTLP endpoints check the content type by its exact essence and refuse cross-site browser requests. Before, `text/plain;x=application/json` passed the substring check while browsers send it without a CORS preflight (found by the dev-squad security review of #62).
- `/api/file`, `/api/workspace` and the events buffer refuse cross-site browser reads. Vite's default CORS lets pages on other localhost ports read them.
- `/api/file` never serves secret files (`.env*`, `.envrc`, `.git-credentials`, private keys, `.npmrc`, `.netrc`, `*.tfvars`; anything under `.git`, `.ssh`, `.aws`, `.gnupg`, `.docker`, `.kube`), even inside a tower root. Dogfood towers with `root: ../..` have the flow-tower folder as their root, where the local key file lives.

## [0.3.0] - 2026-10-10

### Added
- Study-notes examples: `physics-notes` (mechanics) and `history-notes` (the French Revolution), small towers that are not agent systems.
- Math in Markdown files: `$$…$$` is rendered by KaTeX in the file viewer (single dollars stay text, for prices).
- Live events: `?tower=` on `/api/events` (and `emit --tower` with `--source` too) restricts matching to one tower, for two versions of the same project in one library (#52).
- Docs: a second server with `--port`, and where live events go (#52).

### Fixed
- Edge labels no longer sit under the nodes before and after them: the layout reserves room for each label and places it next to its edge, in the 3D scene and in the SVG / PNG export (where long labels are no longer cut).

### Security
- KaTeX stays on 0.16: `npm audit` reports a low-severity advisory (GHSA-238p-pmpm-9mq7) that needs an existing prototype pollution and the `trust` option, which the viewer does not set. The fix is the 0.19 major.

## [0.2.0] - 2026-10-10

### Security
- The repository is public with `main` protected by a ruleset: pull requests only (no direct or force pushes, no deletion), passing CI, maintainer review through CODEOWNERS. Secret scanning with push protection and Dependabot alerts are on; workflows get a read-only token, and PRs from forks need approval before their workflows run.
- Commit history rewritten to the GitHub noreply address before going public.

### Added
- Zoom to selection: selecting a node (click, arrows, lists, search) centers it in the free area and moves the camera in close enough to read it and its neighbours, following as you move between nodes, in tower and map view. A closer zoom of your own is kept.
- Docs: **[what goes where](docs/what-goes-where.md)**, what belongs in a layer, a node, an edge (and a cross-layer link) and a nested tower, with do / don't rules and a validated example; a compact version in the skill's `reference.md`, linked from the procedure, the schema reference and the README.
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

[Unreleased]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JamesMoriartyDecripto/flow-tower/releases/tag/v0.1.0
