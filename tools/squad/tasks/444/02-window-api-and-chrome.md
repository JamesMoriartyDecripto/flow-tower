# 444: window.flowTowerEmbed and chrome=0

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum; plain functions; comments explain why. Verify: run test on tests/embed.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read src/app/demo.ts (ingest), src/app/staticData.ts (EMBED, CHROME), src/app/store.ts (openProject, line 153), src/app/mountApp.tsx, src/app/App.tsx (TopBar line 78, Library line 100), tests/embed.test.ts.

Why: issue #444. The host calls `window.flowTowerEmbed.apply(events)` every ~2 s and may call `open(towerId)`; with `&chrome=0` only the tower, the live feed and the node panel remain.

1. New file src/app/embed.ts: export `embedApi()` returning `{ apply(events: unknown[]): number { return ingest(Array.isArray(events) ? events : []) }, open(towerId: string): void }`; `open` calls `useStore.getState().openProject(towerId)` only when the workspace has a tower or project with that id (else does nothing). Export `installEmbed()` that sets `window.flowTowerEmbed = embedApi()` (declare the global type). In src/app/mountApp.tsx call `installEmbed()` only when `EMBED`.
2. In src/app/App.tsx render `<TopBar>` and `<Library />` only when `CHROME` is true.
Append to tests/embed.test.ts: `embedApi().apply('x' as never)` returns 0; `apply([valid event])` returns 1 and the event is in `useLive.getState().events`; `open('missing')` leaves `useStore.getState().stack` unchanged.
Files: +src/app/embed.ts, src/app/mountApp.tsx, src/app/App.tsx, tests/embed.test.ts
