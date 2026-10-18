# Architecture: where things live

Which source file owns what in the core (schema, loader, resolve, live event matching), the PDF documents, the reports and the audit. Read this before changing code, then open only the files for the task at hand. Server, hub, per-sender tokens, relay and config: [architecture-server.md](architecture-server.md). Tower authoring: [what-goes-where.md](what-goes-where.md); hub behaviour: [hub-reference.md](hub-reference.md).

The code map is in four files, each small enough to load whole:

- this file: data flow, core, documents and reports, tests;
- [architecture-server.md](architecture-server.md): the server, the hub, sharing, history, voice routes;
- [architecture-cli.md](architecture-cli.md): the `flow-tower` commands;
- [architecture-app.md](architecture-app.md): app state, the 3D scene, the HUD.

## Data flow

```
*.tower.yaml ──► src/core (zod schema → loader → resolve → validate) ──► Workspace JSON
                                                                           │
            src/server/plugin.ts  /api/workspace · /api/file · /api/events · /api/voice · Vite websocket push
                                                                           ▼
src/app: store (UI state) + live (events) ──► scene/ (three.js, batched per layer) + hud/ (React DOM)
```

The server only reads files under the tower roots, never secret files or the user's folder (`src/core/secrets.ts`). Workspace changes (a library serve also fills each project's `origins`, mine or example: `src/server/origins.ts`) and live events are pushed over the Vite websocket (`flow-tower:update`, `flow-tower:events`). Events arrive at `/api/events`, are normalized by `src/core/adapters.ts`, and the scene samples the live store at 4 Hz.

Voice commands: the browser records a clip, posts it to `/api/voice`, the server forwards it to OpenRouter speech-to-text, and the transcript is matched to a command in the browser (`src/app/voice/`). With learning on, each turn also goes to the journal in the user's folder (`~/.config/flow-tower`), never in a repo.

## Core (Node and browser)

| File | Open it when |
|---|---|
| `src/core/schema.ts` | Adding or changing a YAML field (then `npm run schema`, docs/schema.md, skills reference) |
| `src/core/loader.ts` | File discovery, library vs nested towers, node resolution, issues. A prompt `file:`, agent `from:` or nested tower outside the project, secret or in the user's folder is not read (an error issue), and a forbidden reference is refused before any existence check. The tower file itself is checked by its real path before it is read (a symlinked `*.tower.yaml` could leak the journal through YAML errors); folder scans skip symlinks that leave the scanned folder or enter the user's folder. `towerIds(entries, files)` gives every tower file its id (#121): with one entry (or none) the old id under `commonDir` is kept; with several entries each file becomes `<entry label>/<path under its entry folder>` (labels unique in entry order), so personal paths stay out of URLs and one file's id does not depend on what else is served. `referenced` (#164) lists every existing file a tower points to, read or only checked, for sharing with files; it is not `watched`, so a docs edit does not reload the library |
| `src/core/secrets.ts` | The one guard for what no tower may read or serve (loader and `/api/file`): `isSecretPath` (key and credential files, `.git`, `.ssh`, `.aws`…), `userHome()` (`~/.config/flow-tower` or `FLOW_TOWER_HOME`, resolved once), `inUserHome` (symlinks resolved), `isForbidden`, its synchronous twin `isForbiddenSync` (existence probes, folder scans; resolves symlinks too) and `realOrSelf`. Node built-ins only (the demo build imports it). Tested in `tests/server-guards.test.ts` |
| `src/core/resolve.ts` | Prompts, `from:` agent files, operational fields (`pickOps`) |
| `src/core/edges.ts` | Edge shorthand parsing |
| `src/core/dbPreview.ts` | The table preview types shared by server and viewer (#264), and `parseSqlSchema`: a tolerant `CREATE TABLE` parser for `.sql` files (quoted names, schemas, inline and table constraints, foreign keys); no data |
| `src/core/otlp.ts` | OTLP/HTTP JSON logs → `usage` / `error` events (Claude Code, Codex telemetry) |
| `src/core/identity.ts` | Who, where and what on every event (#82): picks the first set attribute among the names sources use for user, host, runtime, project and session, and clips them. `bin/identity.js` is the plain-JS twin `emit` loads |
| `src/core/events.ts`, `adapters.ts`, `claudeCode.ts` | Live event shape, matching (with `!` negation), per-harness adapters (Codex, Pi, Hermes); `claudeCode.ts` maps Claude Code / Agent SDK hooks and remembers subagent roles |
| `src/core/types.ts` | Resolved model sent to the browser |
| `src/core/audit.ts` | `flow-tower audit` (#173): `inventory`, the deterministic rules AUD01-AUD11 (`auditTower`, `auditNesting`, `RULES`); each rule is a section of docs/best-practices.md |
| `src/core/roles.ts` | Role classes for the model fit (#173): `ROLE_CLASSES` (needs, OpenRouter categories, modality), `classifyNode` (first match wins: type, model id, spawn edges or lead words, review words, tools, other words), `modelFit` |

## Documents and reports

| File | Open it when |
|---|---|
| `src/core/doc.ts` | The PDF document as plain data (levels 1-3 of one tower; the chapters, the TOC, the anchors). Anchors are scoped by an optional project prefix, so a library can print several projects. No DOM |
| `src/core/docLibrary.ts` | Level 4: the library document, one level-2 document per project with its anchors prefixed by the project id (#65) |
| `src/core/doc-check.ts` | The blocking checks of `export --pdf`: the page rendered, every layer and node shown, counts match, every link has a target, no raw JSON, pages per chapter and layer. Pure |
| `src/app/doc/` | The document view (`?doc=…&level=N`) that the PDF menu and the CLI print: `DocView.tsx` builds and owns the ready signal, `DocLibraryBody.tsx` and `DocLibrary.tsx` render level 4, the rest are the parts, details and images |
| `src/cli/export.ts` | `flow-tower export <file | dir> --pdf [--level 1|2|3|4]`: serves the path, prints the view in headless Chromium, runs the checks, writes the PDF only when every check passes |
| `src/app/exporter.ts`, `exportSvg.ts`, `scene/Snapshot.tsx` | Export packs (P / X): ZIP of every layer and map of the project and its sub-towers, as SVG diagrams or Full HD PNGs rasterized from them, plus the 3D snapshot (captured after post-processing) |
| `src/report/model.ts` | The report document model (#174): `ReportDoc`, sections, blocks (text with `origin: data | draft` and cites, facts, table, findings, bars, status, list), sources |
| `src/report/html.ts`, `report.css.ts` | One print engine for every report type: cover, document control and contents, numbered sections, findings cards, chips, SVG bars, sources appendix; `@page` margin boxes; every class prefixed `rs-` |
| `src/report/checks.ts` | The blocking checks of `flow-tower report`: required sections, empty sections, finding ids, cites, digits in drafted text, raw JSON, internal links, determinism |
| `src/report/types/` | Report types as plug-ins (`index.ts` registry): `security.ts` (CVSS v4.0 bands), `status.ts` (RAG), `postmortem.ts`, `cost.ts`; `tower-documentation` delegates to `flow-tower export` |

## Tests

`tests/*.test.ts` (vitest only collects `tests/`). `examples.test.ts` loads every example and fails on any error, warning or git-ignored file.

`e2e/` (Playwright, `npm run e2e`): one test per example tower driven from the keyboard, live feed, panel layout at six sizes, axe, the voice path (OpenRouter answered by route interception, journal in a temporary `FLOW_TOWER_HOME`). Tests read app state through `window.__flowTower` (dev builds only) and fail on any console or page error.
