# Architecture: where things live

Read this before changing code. Open only the files for the task at hand: each row says when you need it.

## Data flow

```
*.tower.yaml ──► src/core (zod schema → loader → resolve → validate) ──► Workspace JSON
                                                                           │
            src/server/plugin.ts  /api/workspace · /api/file · /api/events · /api/voice · Vite websocket push
                                                                           ▼
src/app: store (UI state) + live (events) ──► scene/ (three.js, batched per layer) + hud/ (React DOM)
```

The server only reads files under the tower roots. Workspace changes and live events are pushed over the Vite websocket (`flow-tower:update`, `flow-tower:events`). Events arrive at `/api/events`, are normalized by `src/core/adapters.ts`, and the scene samples the live store at 4 Hz.

Voice commands: the browser records a clip, posts it to `/api/voice`, the server forwards it to OpenRouter speech-to-text, and the transcript is matched to a command in the browser (`src/app/voice/`). With learning on, each turn also goes to the journal in the user's folder (`~/.config/flow-tower`), never in a repo.

## Core (Node and browser)

| File | Open it when |
|---|---|
| `src/core/schema.ts` | Adding or changing a YAML field (then `npm run schema`, docs/schema.md, skills reference) |
| `src/core/loader.ts` | File discovery, library vs nested towers, node resolution, issues |
| `src/core/resolve.ts` | Prompts, `from:` agent files, operational fields (`pickOps`) |
| `src/core/edges.ts` | Edge shorthand parsing |
| `src/core/otlp.ts` | OTLP/HTTP JSON logs → `usage` / `error` events (Claude Code, Codex telemetry) |
| `src/core/events.ts`, `adapters.ts`, `claudeCode.ts` | Live event shape, matching (with `!` negation), per-harness adapters (Codex, Pi, Hermes); `claudeCode.ts` maps Claude Code / Agent SDK hooks and remembers subagent roles |
| `src/core/types.ts` | Resolved model sent to the browser |

## Server and CLI

| File | Open it when |
|---|---|
| `src/server/plugin.ts` | API routes, file sandbox, live reload. `USER_HOME` = `~/.config/flow-tower` (or `FLOW_TOWER_HOME`), the user's folder: never in a repo, never served by `/api/file`. Key lookup: environment, then `USER_HOME/.env`, then the git-ignored `.env` in the flow-tower folder (fallback). Gives the voice handler the journal store and the names an alias may point at |
| `src/server/events.ts` | Event hub (ring buffer, 204 empty responses for Claude Code hooks) |
| `src/server/update.ts` | Daily update check against GitHub releases (cache, opt-out), served as `/api/version` |
| `src/server/voice.ts` | `/api/voice` (speech to text), `/api/voice/chat` (one agent step with tools) and `/api/voice/speak` (the spoken reply, mp3), all through OpenRouter with zero data retention and the key kept here. GET says what is configured (never the key). Mounts the learning routes (`/journal`, `/memory`, `/review`) when given a store; `/journal` and `/memory` work without a key. Only this page gets through (`guard.ts`), GETs included, with per-route body caps and 3 calls at once |
| `src/server/voice-memory.ts` | The voice journal (`voice-journal.jsonl`: one line per turn, outcome marks applied on read, rotated past 5 MB) and memory (`voice-memory.json`: accepted aliases and notes, pending suggestions, review cursor) in `USER_HOME`, owner-only files; 7-day stats; forget. Tested in `tests/voice-journal.test.ts` |
| `src/server/voice-learning.ts` | Learning routes under `/api/voice`: append a turn or a mark, read and decide on the memory, and the review (an LLM reads up to 200 new turns and proposes aliases to real names, rules and reply style; nothing applies until accepted) |
| `src/server/files.ts` | Reading one referenced file inside its tower root (shared by `/api/file` and the demo build) |
| `scripts/build-demo.ts` | Static demo for GitHub Pages: freezes the workspace and referenced files into `data/`, then builds the app in `demo` mode |
| `bin/flow-tower.js` | CLI commands: serve, init, validate, emit, guide, install-skill |
| `src/cli/validate.ts` | `validate --json` output |

## App state

| File | Open it when |
|---|---|
| `src/app/store.ts` | Navigation state: stack, selection, focus, view, quality; applies a deep link on first load |
| `src/app/settings.ts` | Persisted preferences (themes, fonts, interface size, animations, visibility, default view) |
| `src/app/live.ts`, `liveHooks.ts` | Live store (copy-on-write, never mutate), polling, per-tower live state |
| `src/app/keynav.ts`, `spatial.ts` | Keyboard navigation of the scene (arrows, layers, camera nudges, sub-towers) |
| `src/app/layout.ts` | ELK layout of a layer (left to right) |
| `src/app/ops.ts` | Operational markers and inspector rows |
| `src/app/api.ts` | Fetching the workspace and refetching on server push |
| `src/app/exporter.ts`, `exportSvg.ts`, `scene/Snapshot.tsx` | Export packs (P / X): ZIP of every layer and map of the project and its sub-towers, as SVG diagrams or Full HD PNGs rasterized from them, plus the 3D snapshot (captured after post-processing) |
| `src/app/staticData.ts`, `demo.ts` | Static demo mode (Vite mode `demo`): data from `data/`, in-browser live simulator, DEMO chip |
| `src/app/theme.ts`, `themes.ts` | Node / edge styles and bloom colors; theme switching (shared colors mutated in place, scene remounted) |
| `src/app/graph.ts` | Neighbours, related nodes, search, breadcrumb paths, deep links (`?tower=&layer=&node=`) |
| `src/app/voice/commands.ts` | Voice command parser, Italian and English: matches the transcript against project, layer, node and agent names, tolerates misheard words, returns a numbered choice when ambiguous. Pure, tested in `tests/voice-commands.test.ts` |
| `src/app/voice/mic.ts` | Microphone in every browser: `MediaRecorder` clips cut at end of speech (~0.6 s silence), adaptive noise floor |
| `src/app/voice/voice.ts` | Voice store: start / stop, upload to `/api/voice`, numbered picks, stop after 2 minutes idle; runs commands with the same store calls as the keyboard; applies accepted aliases, records each turn, reviews when due on stop |
| `src/app/voice/journal.ts` | Page side of the journal (#68), only when Settings > Voice > Learning is on: records turns, marks the last one corrected / undone / interrupted from what comes next, loads the memory, applies aliases, gives the agent its notes, asks for a review after 20 new turns |
| `src/app/voice/agent.ts` | Voice agent (#63): routing (questions to the agent, navigation to the parser), the LLM loop through `/api/voice/chat` (max 4 steps), spoken replies through `<audio>` (`/api/voice/speak`), barge-in and the echo filter |
| `src/app/voice/tools.ts` | The agent's tools, run in the page on the tower on screen: read (screen, layers, nodes, connections, files, search) and act (focus, select, open file, open project, navigate) |

## Scene (three.js via react-three-fiber)

Rendering is batched per layer: instanced meshes, `LineSegments2`, troika `BatchedText`. Never add per-node meshes or `<Text>`.

| File | Open it when |
|---|---|
| `scene/Tower.tsx` | Layer stack, camera framings, which layers render |
| `scene/hudFrame.ts` | Keeping the scene in the free area between HUD panels (`setViewOffset`), content-aware zoom |
| `scene/frameBudget.ts` | On-demand rendering, FPS caps, `keepAlive` |
| `scene/lens.ts` | Hover lens and map layout |
| `scene/Layer.tsx`, `LayerNodes.tsx`, `LayerEdges.tsx`, `TextBatch.tsx` | Drawing one layer: plates, nodes, markers, labels, edges |
| `scene/batch.ts` | Shared geometries, color dimming, polyline to `LineSegments2` helpers |
| `scene/shiftPan.ts` | Shift + drag / two-finger scroll pans the camera |
| `scene/Links.tsx`, `Particles.tsx` | Cross-layer links and animated flow |
| `scene/LiveOverlay.tsx`, `chips.ts` | Live highlights and the DOM chips projected onto nodes |
| `scene/Environment.tsx`, `Effects.tsx` | Base rings, scanner, sparkles, bloom |

## HUD (React DOM)

| File | Open it when |
|---|---|
| `hud/Chrome.tsx` | Top bar, Layers panel (with sub-towers list), legend, bottom controls |
| `hud/Inspector.tsx`, `Connections.tsx`, `OpsInfo.tsx` | Node panel: overview, connections, operations / data / evals, prompt, tools, files |
| `hud/NodeList.tsx` | Right panel while no node is selected: the nodes of the focused layer in flow order |
| `hud/Library.tsx` | Project gallery |
| `hud/LiveFeed.tsx`, `LiveChips.tsx` | Live feed and chips |
| `hud/Settings.tsx`, `Shortcuts.tsx` | Settings page, keyboard overlay |
| `hud/FileViewer.tsx` | File popup with syntax highlighting (shiki), focus restored on close |
| `hud/MarkdownView.tsx` | Formatted Markdown: no raw HTML, links to the node's files, math in `$$…$$` (KaTeX) |
| `hud/Voice.tsx` | MIC button (top bar, library header) and the voice caption under the top bar (with the pending-suggestions chip); hidden in the static demo |
| `hud/VoiceLearning.tsx` | Settings > Voice > Learning: journal toggle, 7-day stats, suggestions to accept or reject, learned items, Review now, Forget everything |
| `hud/focusNav.ts`, `Tooltip.tsx` | Keyboard focus inside panels, HUD tooltips |
| `src/app/App.tsx` | Global keyboard handler, panel composition |
| `src/app/styles.css` | All HUD styles (CSS variables per theme; `--ui-scale` zooms the HUD) |

## Tests

`tests/*.test.ts` (vitest only collects `tests/`). `examples.test.ts` loads every example and fails on any error, warning or git-ignored file.

`e2e/` (Playwright, `npm run e2e`): one test per example tower driven from the keyboard, live feed, panel layout at six sizes, axe, the voice path (OpenRouter answered by route interception, journal in a temporary `FLOW_TOWER_HOME`). Tests read app state through `window.__flowTower` (dev builds only) and fail on any console or page error.
