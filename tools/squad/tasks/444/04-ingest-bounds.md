# 444: bound host batches in ingest

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum. Verify: run test on tests/embed.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read src/app/demo.ts (ingest, lines 31-42), src/app/live.ts (FEED = 300, line 55), tests/embed.test.ts.

Why: security pass on #444. A host batch of any size runs resolveTargets on every element although the feed keeps only the last 300; a host `ts` in the future would sort ahead of every later event.

1. In src/app/demo.ts `ingest`: add `const MAX_BATCH = 300;` (comment: the live feed keeps the last 300, see live.ts FEED) and parse only `events.slice(-MAX_BATCH)`. Replace `ts: e.ts ?? Date.now()` with `ts: Math.min(e.ts ?? now, now)` where `const now = Date.now();` is taken once at the top of ingest.
Append to tests/embed.test.ts: a batch of 301 valid events applies 300; an event with `ts: Date.now() + 3_600_000` is applied with `ts <= Date.now()`; an event with a past `ts` keeps it.
Files: src/app/demo.ts, tests/embed.test.ts
