---
id: store-mutation
category: reviewer
check: regex
rubric: true
tools: read_file
files: fixtures/live-store.ts
steps: 6
---
# Review the live store

From real work: Flow Tower's live store is copy-on-write; CLAUDE.md records "never mutate zustand state in place (useSyncExternalStore loops)".

## Prompt

Review `fixtures/live-store.ts` (read it with the read_file tool). It is the store behind a 3D view that re-renders when live events arrive.

Report only real defects, most severe first. For each: the line, what goes wrong at runtime, and the fix. If the code is fine, say so. No style nits.

## Expected

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.
