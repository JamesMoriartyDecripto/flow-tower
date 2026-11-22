# 447-09: the score follows the gate exactly, with types that say what a run line holds

Rules: English only; edit only Files; write the minimum; comments explain why. Whenever a step changes a rule, update the tests that relied on the old one. Verify: run test on tests/model-benchmark-squad-score.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read examples/model-benchmark/scripts/squad-score.mjs, examples/model-benchmark/scripts/squad-score.d.mts, tools/squad/gate.mjs (lines 85-95, the blocking rule), tests/model-benchmark-squad-score.test.ts.

Why: review of #447. `isBlocking` lowercases the severity and the gate does not, so `Medium` blocks in the gate and not in the score. The blocking filter runs twice. `summarize` and `RunLine` handle lines without `keys`, `keysBlocking` or `blocking`, which no run ever wrote. `kind: 'defect' | 'clean' | string` is just `string`. The table test checks only the column titles.

1. squad-score.mjs: `isBlocking(severity)` is `!['medium', 'low'].includes(severity)`, the gate's rule as written, case included. Compute the blocking findings once and use them for `keysBlocking` and `blocking`. In `summarize` read `l.keys`, `l.keysBlocking` and `l.blocking` directly, without `?? []`.
2. squad-score.d.mts: `keys`, `keysBlocking` and `blocking` are required in `RunLine`; `kind` is `'defect' | 'clean'`.
3. tests/model-benchmark-squad-score.test.ts: `isBlocking('medium')` and `('low')` are false, `('Medium')`, `('HIGH')`, `('urgent')` and `(undefined)` are true. The line builder sets `keys: [], keysBlocking: [], blocking: 0` by default and is typed `(over: Partial<RunLine>) => RunLine`. Replace the header-only table test with one that renders `table(summarize(...))` over the three lines of the existing summarize test and asserts the cells of its row for Key seen, Key blocked and Clean not blocked.

Files: examples/model-benchmark/scripts/squad-score.mjs, examples/model-benchmark/scripts/squad-score.d.mts, tests/model-benchmark-squad-score.test.ts
