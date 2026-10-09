# Architecture: where things live

Read this before changing code. Open only the files for the task at hand: each row says when you need it.

## Data flow

```
*.tower.yaml ──► src/core (zod schema → loader → resolve → validate) ──► Workspace JSON
                                                                           │
            src/server/plugin.ts  /api/workspace · /api/file · /api/events · Vite websocket push
                                                                           ▼
src/app: store (UI state) + live (events) ──► scene/ (three.js, batched per layer) + hud/ (React DOM)
```

The server only reads files under the tower roots. Workspace changes and live events are pushed over the Vite websocket (`flow-tower:update`, `flow-tower:events`). Events arrive at `/api/events`, are normalized by `src/core/adapters.ts`, and the scene samples the live store at 4 Hz.

## Core (Node and browser)

| File | Open it when |
|---|---|
| `src/core/schema.ts` | Adding or changing a YAML field (then `npm run schema`, docs/schema.md, skills reference) |
| `src/core/loader.ts` | File discovery, library vs nested towers, node resolution, issues |
| `src/core/resolve.ts` | Prompts, `from:` agent files, operational fields (`pickOps`) |
| `src/core/edges.ts` | Edge shorthand parsing |
| `src/core/events.ts`, `adapters.ts` | Live event shape, matching, per-harness adapters (Claude Code, Agent SDK, Codex, Pi, Hermes) |
| `src/core/types.ts` | Resolved model sent to the browser |

## Server and CLI

| File | Open it when |
|---|---|
| `src/server/plugin.ts` | API routes, file sandbox, live reload |
| `src/server/events.ts` | Event hub (ring buffer, 204 empty responses for Claude Code hooks) |
| `bin/flow-tower.js` | CLI commands: serve, init, validate, emit, guide, install-skill |
| `src/cli/validate.ts` | `validate --json` output |

## App state

| File | Open it when |
|---|---|
| `src/app/store.ts` | Navigation state: stack, selection, focus, view, quality |
| `src/app/settings.ts` | Persisted preferences (themes, fonts, interface size, animations, visibility, default view) |
| `src/app/live.ts`, `liveHooks.ts` | Live store (copy-on-write, never mutate), polling, per-tower live state |
| `src/app/keynav.ts`, `spatial.ts` | Keyboard navigation of the scene (arrows, layers, camera nudges, sub-towers) |
| `src/app/layout.ts` | ELK layout of a layer (left to right) |
| `src/app/ops.ts` | Operational markers and inspector rows |
| `src/app/graph.ts` | Neighbours, related nodes, search, breadcrumb paths |

## Scene (three.js via react-three-fiber)

Rendering is batched per layer: instanced meshes, `LineSegments2`, troika `BatchedText`. Never add per-node meshes or `<Text>`.

| File | Open it when |
|---|---|
| `scene/Tower.tsx` | Layer stack, camera framings, which layers render |
| `scene/hudFrame.ts` | Keeping the scene in the free area between HUD panels (`setViewOffset`), content-aware zoom |
| `scene/frameBudget.ts` | On-demand rendering, FPS caps, `keepAlive` |
| `scene/lens.ts` | Hover lens and map layout |
| `scene/Layer.tsx`, `LayerNodes.tsx`, `LayerEdges.tsx`, `TextBatch.tsx` | Drawing one layer: plates, nodes, markers, labels, edges |
| `scene/Links.tsx`, `Particles.tsx` | Cross-layer links and animated flow |
| `scene/LiveOverlay.tsx`, `chips.ts` | Live highlights and the DOM chips projected onto nodes |
| `scene/Environment.tsx`, `Effects.tsx` | Base rings, scanner, sparkles, bloom |

## HUD (React DOM)

| File | Open it when |
|---|---|
| `hud/Chrome.tsx` | Top bar, Layers panel (with sub-towers list), legend, bottom controls |
| `hud/Inspector.tsx`, `Connections.tsx`, `OpsInfo.tsx` | Node panel: overview, connections, operations / data / evals, prompt, tools, files |
| `hud/Library.tsx` | Project gallery |
| `hud/LiveFeed.tsx`, `LiveChips.tsx` | Live feed and chips |
| `hud/Settings.tsx`, `Shortcuts.tsx` | Settings page, keyboard overlay |
| `hud/focusNav.ts`, `Tooltip.tsx` | Keyboard focus inside panels, HUD tooltips |
| `src/app/App.tsx` | Global keyboard handler, panel composition |
| `src/app/styles.css` | All HUD styles (CSS variables per theme; `--ui-scale` zooms the HUD) |

## Tests

`tests/*.test.ts` (vitest only collects `tests/`). `examples.test.ts` loads every example and fails on any error, warning or git-ignored file.
