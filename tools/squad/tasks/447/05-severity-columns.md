# 447-05: report what the gate would block, next to the verdict

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why; files under ~400 lines. Never rewrite or empty an existing test file: append cases. Verify: run test on tests/model-benchmark-squad-score.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read examples/model-benchmark/scripts/squad-score.mjs and its .d.mts, tests/model-benchmark-squad-score.test.ts.

Why: issue #447. On clean cases, 62 of 97 failed runs were a `changes` verdict with only medium or low findings. The gate blocks on critical and high findings, so the report must also show what each model does by severity alone: whether it reports a key defect at all, whether it reports it as blocking, and whether it leaves a clean head unblocked.

1. In examples/model-benchmark/scripts/squad-score.mjs:
   - Export `isBlocking(severity)`: true for `critical` and `high` (case-insensitive) and for any value that is not `medium` or `low` (a missing or unknown severity blocks, as in the gate). Use it for the existing `blocking` count.
   - `scoreRun` also returns `keysBlocking`: the ids of the case keys matched by at least one finding whose severity is blocking. `keys` keeps its meaning (matched at any severity). A failed run returns `keysBlocking: []`.
   - `summarize` rows gain `seen` (defect runs with `keys.length > 0`), `blocked` (defect runs with `keysBlocking.length > 0`) and `cleanOpen` (clean runs with no `failure` and `blocking === 0`). A line without `keysBlocking` (written before this step) counts as not blocked.
   - `table` gains three columns after `Clean approved`: `Key seen`, `Key blocked`, `Clean not blocked`, as `n/total` cells over the defect runs, the defect runs and the clean runs.
   - Update squad-score.d.mts for the new export and fields.
2. Append to tests/model-benchmark-squad-score.test.ts: `isBlocking` for `HIGH`, `critical`, `medium`, `low`, `undefined` and `urgent`; a defect case where the key finding is `low` under an `approve` verdict gives `keys: ['K']`, `keysBlocking: []`, `pass: false`; the same finding as `high` gives `keysBlocking: ['K']`; `summarize` over those two lines plus one clean line with `blocking: 0` gives `seen: 2`, `blocked: 1`, `cleanOpen: 1`; `table` contains the three new column names.

Files: examples/model-benchmark/scripts/squad-score.mjs, examples/model-benchmark/scripts/squad-score.d.mts, tests/model-benchmark-squad-score.test.ts
