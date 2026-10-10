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

The server only reads files under the tower roots, never secret files or the user's folder (`src/core/secrets.ts`). Workspace changes and live events are pushed over the Vite websocket (`flow-tower:update`, `flow-tower:events`). Events arrive at `/api/events`, are normalized by `src/core/adapters.ts`, and the scene samples the live store at 4 Hz.

Voice commands: the browser records a clip, posts it to `/api/voice`, the server forwards it to OpenRouter speech-to-text, and the transcript is matched to a command in the browser (`src/app/voice/`). With learning on, each turn also goes to the journal in the user's folder (`~/.config/flow-tower`), never in a repo.

## Core (Node and browser)

| File | Open it when |
|---|---|
| `src/core/schema.ts` | Adding or changing a YAML field (then `npm run schema`, docs/schema.md, skills reference) |
| `src/core/loader.ts` | File discovery, library vs nested towers, node resolution, issues. A prompt `file:`, agent `from:` or nested tower outside the project, secret or in the user's folder is not read (an error issue), and a forbidden reference is refused before any existence check. The tower file itself is checked by its real path before it is read (a symlinked `*.tower.yaml` could leak the journal through YAML errors); folder scans skip symlinks that leave the scanned folder or enter the user's folder |
| `src/core/secrets.ts` | The one guard for what no tower may read or serve (loader and `/api/file`): `isSecretPath` (key and credential files, `.git`, `.ssh`, `.aws`…), `userHome()` (`~/.config/flow-tower` or `FLOW_TOWER_HOME`, resolved once), `inUserHome` (symlinks resolved), `isForbidden`, its synchronous twin `isForbiddenSync` (existence probes, folder scans; resolves symlinks too) and `realOrSelf`. Node built-ins only (the demo build imports it). Tested in `tests/server-guards.test.ts` |
| `src/core/resolve.ts` | Prompts, `from:` agent files, operational fields (`pickOps`) |
| `src/core/edges.ts` | Edge shorthand parsing |
| `src/core/otlp.ts` | OTLP/HTTP JSON logs → `usage` / `error` events (Claude Code, Codex telemetry) |
| `src/core/events.ts`, `adapters.ts`, `claudeCode.ts` | Live event shape, matching (with `!` negation), per-harness adapters (Codex, Pi, Hermes); `claudeCode.ts` maps Claude Code / Agent SDK hooks and remembers subagent roles |
| `src/core/types.ts` | Resolved model sent to the browser |

## Server and CLI

| File | Open it when |
|---|---|
| `src/server/plugin.ts` | API routes, file sandbox, live reload. `USER_HOME` = `~/.config/flow-tower` (or `FLOW_TOWER_HOME`), the user's folder: never in a repo, never served by `/api/file`. Key lookup: environment, then `USER_HOME/.env`, then the git-ignored `.env` in the flow-tower folder (fallback). Gives the voice handler the journal store and the names an alias may point at |
| `src/server/home.ts` | Re-exports `userHome`; `warnIfInRepo` warns at startup when `FLOW_TOWER_HOME` is inside the flow-tower folder, symlinks followed on both sides |
| `src/server/events.ts` | Event hub (ring buffer, 204 empty responses for Claude Code hooks) |
| `src/server/update.ts` | Daily update check against GitHub releases (cache, opt-out), served as `/api/version` |
| `src/server/voice.ts` | `/api/voice` (speech to text), `/api/voice/chat` (one agent step with tools) and `/api/voice/speak` (the spoken reply, mp3), all through OpenRouter with zero data retention and the key kept here. GET says what is configured (never the key). Mounts the learning routes (`/journal`, `/memory`, `/review`) when given a store; `/journal` and `/memory` work without a key. Only this page gets through (`guard.ts`), GETs included, with per-route body caps and 6 calls at once; a stream that fails after its headers just ends |
| `src/server/voice-memory.ts` | The voice journal (`voice-journal.jsonl`: one line per turn, outcome marks applied on read, rotated past 5 MB) and memory (`voice-memory.json`: accepted aliases and notes, pending suggestions, review cursor) in `USER_HOME`: the default folder 0700 (an existing `FLOW_TOWER_HOME` keeps its permissions; chmod is best effort), files 0600, whole-file writes atomic (temp file and rename, one retry on a Windows EPERM/EBUSY, the temp file removed either way), turn times clamped to the last day, a malformed memory file read as empty lists; accepted notes capped at 20 and 2000 characters (`decide` throws, the route answers 409); notes and aliases removed by value; 7-day stats; forget. Tested in `tests/voice-journal.test.ts` |
| `src/server/voice-learning.ts` | Learning routes under `/api/voice`: append a turn or a mark, read and decide on the memory, and the review (an LLM reads up to 200 new turns, oldest first, and proposes aliases to real names, never short or common words nor part of a real name, rules and reply style; nothing applies until accepted) |
| `src/server/files.ts` | Reading one referenced file inside its tower root, never a secret or the user's folder (`isForbidden`); shared by `/api/file` and the demo build |
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
| `src/app/voice/mic.ts` | Microphone in every browser: an always-on `MediaRecorder` cut at end of speech (~0.6 s silence, 8 s max), silence thrown away every 1.5 s; every 40 ms the voice band of the spectrum against a per-bin noise floor calibrated in the first 0.7 s as the per-bin minimum with a ×1.5 margin, so speech then is not learned as noise (`noise.ts` `updateFloor`); each clip carries its recording time; the sensitivity is read live from Settings |
| `src/app/voice/noise.ts` | Speech or noise (#73): `isSpeech` (band power over its floor and an absolute minimum, whitened spectral flatness, per sensitivity low / normal / high) `updateFloor` (seed, calibration with a ×1.5 margin, then slow tracking) and `isHallucination` (Whisper's noise text: "Grazie.", "Thank you.", subtitle credits). Pure, tested in `tests/voice-noise.test.ts` |
| `src/app/voice/duplex.ts` | Who talks when (#72): two kinds of playback spans, *active* (a reply synthesizing or playing: the gate, the caption and Esc) and *audible* (a sentence coming out of the speakers: only clips over it go through `bargeIn`); `keepClip` drops clips recorded during a reply or 700 ms after unless Interrupt by voice is on; `isEcho` and `bargeIn` judged on the recording time. Pure, tested in `tests/voice-duplex.test.ts` |
| `src/app/voice/voice.ts` | Voice store: start / stop, the half-duplex gate on each clip, upload to `/api/voice`, drops echoes and Whisper noise, barge-in (with Interrupt by voice, only for clips over audible playback: a command during the silent wait for synthesis is handled normally), a one-time hint when a clip lands in the 700 ms tail, `hush()` for Esc (mutes the agent turn still streaming, aborts its stream so no later tool call moves the view, captions "Stopped" and records it interrupted), numbered picks, stop after 2 minutes idle; runs commands with the same store calls as the keyboard; applies accepted aliases, records each turn, reviews when due on stop |
| `src/app/voice/journal.ts` | Page side of the journal (#68), only when Settings > Voice > Learning is on: records turns, marks the last one corrected / undone / interrupted from what comes next (corrections normalized: NFC, leading quotes and punctuation dropped), loads the memory (malformed items dropped), applies aliases (whole words, never inside a name already written out), gives the agent its notes (capped like the server), asks for a review after 20 new turns, one at a time; the turns it covered come off the count even when it fails, so a failed review (maybe paid) waits for 20 more |
| `src/app/voice/agent.ts` | Voice agent (#63): routing (questions to the agent, navigation to the parser), the LLM loop through `/api/voice/chat` (max 4 steps), spoken replies through `<audio>` (`/api/voice/speak`, synthesized one or two sentences ahead, one 429 retry, a sentence skipped after 8 s; a reply the browser refuses to play (autoplay blocked) ends at once; active and audible spans for `duplex.ts`), `isSpeaking` (one state from the first sentence until the queue drains, for the caption, Esc and the gate), `stopSpeaking`, the echo filter; accepted notes framed as preferences that never override the instructions, tools or screen |
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
