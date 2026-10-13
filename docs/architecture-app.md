# Architecture: app, scene, HUD

Which browser file owns what: navigation and live state (zustand stores), the three.js scene batched per layer, and the HUD panels (Inspector, library, voice, hub). Overview: [architecture.md](architecture.md).

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
| `src/app/sharing.ts` | Pure formatting for the satellite SAT chip and Sharing section (#91), unit-tested without a DOM |
| `src/app/hub.ts` | Pure model of the Hub panel (#92): Now rows grouped by machine / runtime / project / starter (`AUTO` for CI), the state thresholds (● under 2 min, ◐ under 15 min, ○ silent), the `HUB n/m` pill and the Machines dots. No React, no fetch, no DOM |
| `src/app/main.tsx` | Entry point: fonts, styles, prefs, the React root, and the dev-only `window.__flowTower` hook for E2E |
| `src/app/staticData.ts`, `demo.ts` | Static demo mode (Vite mode `demo`): data from `data/`, in-browser live simulator, DEMO chip |
| `src/app/theme.ts`, `themes.ts` | Node / edge styles and bloom colors; theme switching (shared colors mutated in place, scene remounted) |
| `src/app/graph.ts` | Neighbours, related nodes, search, breadcrumb paths, deep links (`?tower=&layer=&node=`) |
| `src/app/voice/commands.ts` | Voice command parser, Italian and English: matches the transcript against project, layer, node and agent names, tolerates misheard words, returns a numbered choice when ambiguous. Pure, tested in `tests/voice-commands.test.ts` |
| `src/app/voice/actions.ts` | Running a parsed action (`execute()`): the fixed phrases (#145: scroll the viewer, the Hub panel, the node-type filter) and the older ones apply the same store calls as the keyboard and return the caption text. Its own module so the parser, the agent tools and the tests share one place, and the viewer scroll event (`SCROLL_EVENT`) lives with the action that dispatches it |
| `src/app/voice/mic.ts` | Microphone in every browser: an always-on `MediaRecorder` cut at end of speech (~0.6 s silence, 8 s max), silence thrown away every 1.5 s; every 40 ms the voice band of the spectrum against a per-bin noise floor calibrated in the first 0.7 s as the per-bin minimum with a ×1.5 margin, so speech then is not learned as noise (`noise.ts` `updateFloor`); each clip carries its recording time; the sensitivity is read live from Settings |
| `src/app/voice/noise.ts` | Speech or noise (#73): `isSpeech` (band power over its floor and an absolute minimum, whitened spectral flatness, per sensitivity low / normal / high) `updateFloor` (seed, calibration with a ×1.5 margin, then slow tracking) and `isHallucination` (Whisper's noise text: "Grazie.", "Thank you.", subtitle credits). Pure, tested in `tests/voice-noise.test.ts` |
| `src/app/voice/duplex.ts` | Who talks when (#72): two kinds of playback spans, *active* (a reply synthesizing or playing: the gate, the caption and Esc) and *audible* (a sentence coming out of the speakers: only clips over it go through `bargeIn`); `keepClip` drops clips recorded during a reply or 700 ms after unless Interrupt by voice is on; `isEcho` and `bargeIn` judged on the recording time. Pure, tested in `tests/voice-duplex.test.ts` |
| `src/app/voice/voice.ts` | Voice store: start / stop, the half-duplex gate on each clip, upload to `/api/voice`, drops echoes and Whisper noise, barge-in (with Interrupt by voice, only for clips over audible playback: a command during the silent wait for synthesis is handled normally), a one-time hint when a clip lands in the 700 ms tail, `hush()` for Esc (mutes the agent turn still streaming, aborts its stream so no later tool call moves the view, captions "Stopped" and records it interrupted), numbered picks, stop after 2 minutes idle; runs commands with the same store calls as the keyboard; applies accepted aliases, records each turn, reviews when due on stop |
| `src/app/voice/journal.ts` | Page side of the journal (#68), only when Settings > Voice > Learning is on: records turns, marks the last one corrected / undone / interrupted from what comes next (corrections normalized: NFC, leading quotes and punctuation dropped), loads the memory (malformed items dropped), applies aliases (whole words, never inside a name already written out), gives the agent its notes (capped like the server), asks for a review after 20 new turns, one at a time; the turns it covered come off the count even when it fails, so a failed review (maybe paid) waits for 20 more |
| `src/app/voice/agent.ts` | Voice agent (#63): routing (questions to the agent, navigation to the parser), the LLM loop through `/api/voice/chat` (max 4 steps), spoken replies through `<audio>` (`/api/voice/speak`, synthesized one or two sentences ahead, one 429 retry, a sentence skipped after 8 s; a reply the browser refuses to play (autoplay blocked) ends at once; active and audible spans for `duplex.ts`), `isSpeaking` (one state from the first sentence until the queue drains, for the caption, Esc and the gate), `stopSpeaking`, `enqueueReady` (the cached ack, #70, through the same player), the echo filter; accepted notes framed as preferences that never override the instructions, tools or screen |
| `src/app/voice/ack.ts` | The short spoken acknowledgement (#70): cached phrases per language (rotated, one per turn), synthesized once when the mic starts, 60 s cooldown after a failed synthesis; played through `enqueueReady` 600 ms after the end of speech if the agent has said nothing. Language from the transcription, else Settings, else the browser. Tested in `tests/voice-agent.test.ts` |
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
| `scene/BatchLine.tsx` | One batched `LineSegments2` for many segments (per-point colours, dashes) |
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
| `hud/Updates.tsx` | Settings › Updates (#141): the installed version and the last check from `/api/version`, `Check for updates` (the forced check, throttled) and the copyable local update command; the top-bar `↑ vX.Y.Z` chip re-reads on a forced check through `VERSION_EVENT` |
| `hud/Sharing.tsx` | The SAT chip (polls `/api/sharing`) and Settings › Sharing: pause and the "does it reach the hub?" test |
| `hud/Hub.tsx` | The Hub panel (#92): `H` opens it in the Inspector's place, tabs Now and Machines (`[ ]`, ← →), the top-bar `HUB n/m` chip (polls `/api/hub/me`) and its `READ-ONLY` pill for a remote viewer |
| `hud/HubAlerts.tsx` | The Alerts tab and the `⚠ n` pill (#94): level chips, rule labels, Ack / Snooze 1h / 1d and `A` from loopback only; the library header has the same pill, which closes the library and opens the tab |
| `hud/HubAdmin.tsx`, `hubAdminApi.ts`, `hubAdminModel.ts` | The Admin tab (#93), only when not read-only: senders (token box shown once, revoke by typing the id), viewers, budgets, alert switches, retention and delete-before with a preview, the audit log |
| `hud/dialog.ts` | Modal focus for HUD dialogs: move focus in, trap Tab, restore on close |
| `hud/FileViewer.tsx` | File popup with syntax highlighting (shiki), focus restored on close |
| `hud/MarkdownView.tsx` | Formatted Markdown: no raw HTML, links to the node's files, math in `$$…$$` (KaTeX) |
| `hud/Voice.tsx` | MIC button (top bar, library header) and the voice caption under the top bar (with the pending-suggestions chip); hidden in the static demo |
| `hud/VoiceLearning.tsx` | Settings > Voice > Learning: journal toggle, 7-day stats, suggestions to accept or reject, learned items, Review now, Forget everything |
| `hud/focusNav.ts`, `Tooltip.tsx` | Keyboard focus inside panels, HUD tooltips |
| `src/app/App.tsx` | Global keyboard handler, panel composition |
| `src/app/styles.css` | All HUD styles (CSS variables per theme; `--ui-scale` zooms the HUD) |

