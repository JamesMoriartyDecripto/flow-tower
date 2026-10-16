---
id: history-dedupe
category: reviewer
check: regex
rubric: true
tools: read_file
files: fixtures/history-row.ts
steps: 6
---
# Review the history writer's dedupe

From real work: Flow Tower issue #187. The hub's history dropped every `tool.end` as a replay of its `tool.start` (the key had no kind), so durations and tool errors never reached the alerts. Fixture: the pre-fix `toRow` and `eventIdOf` (`src/server/history/row.ts`, `src/server/limits.ts`), trimmed.

## Prompt

Review `fixtures/history-row.ts` (read it with the read_file tool). It writes the hub's event history; the hub's alerts count tool errors and durations from these rows. Hooks send a `tool.start` and later a `tool.end` (with `status` and `duration_ms`) for every tool call.

Report only real defects, most severe first. For each: the line, what goes wrong at runtime, and the fix. If the code is fine, say so. No style nits.

## Expected

The planted defect: `event_key` is `sender:id`, and a call's `tool.start` and `tool.end` share the call id, so with `UNIQUE` + `INSERT OR IGNORE` every `tool.end` is ignored as a replay. Its `status: error` and `duration_ms` are lost, so tool errors never count. Fix: put the kind in the key (`sender:kind:id`).

```regex
tool\.end
kind
```

Rubric (blind scorer, 0-10):
- 6 points: finds the start/end collision on `event_key` and its consequence (the end, with its error status and duration, is dropped).
- 2 points: the fix: the kind (or the event type) in the key.
- 2 points: no invented defects; the micros rounding, the ts fallback and dedupe of real replays are intended. Deduct 1 per false finding. (Noting that `kind: error` events carry no `status` is a fair second finding, not a false one.)
