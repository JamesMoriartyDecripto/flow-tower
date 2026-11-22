# 447-01: score a squad review run against a case key

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why; files under ~400 lines. Verify: run test on tests/model-benchmark-squad-score.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read tools/squad/gate.mjs (parseVerdict, checkFinding, lines 14-84), examples/model-benchmark/tasks/squad-review/cases.json, examples/model-benchmark/scripts/report.mjs (table style), tests/squad-gate.test.ts (how a test imports a plain .mjs).

Why: issue #447. The squad's reviewer and security models are re-measured on real pull requests of this repository, run through tools/squad/run.mjs. This step is the pure scoring; the next step is the driver that calls it.

1. New file examples/model-benchmark/scripts/squad-score.mjs, pure (no fs, no network, no child process), with a `.d.mts` next to it declaring every export:
   - `scoreRun({ kase, outcome, answer, readFile, parseVerdict, checkFinding })` returns `{ pass, verdict, flagged, keys, blocking, findings, verified, failure }`. `kase` is one entry of cases.json. `parseVerdict` and `checkFinding` are the gate's functions, passed in so this file imports nothing from tools/squad.
     - `outcome` other than `'finish'` (for example `empty-answer`, `truncated-answer`, `no-verdict`, `http-error`, `timeout`): `pass` false, `failure` = that outcome, `verdict` null, counts 0.
     - `parseVerdict(answer)` throws: `pass` false, `failure` `'no-verdict'`.
     - `findings` = number of findings; `verified` = how many `checkFinding(f, readFile)` returns with `status: 'verified'`; `blocking` = how many have severity `critical` or `high` (case-insensitive).
     - `keys` = ids of the case keys matched: a key matches a finding when the finding's `file` without its `:line` suffix equals `key.file` and `new RegExp(key.pattern, 'i')` matches the finding's `what`, `why`, `fix` and `quote` joined by a space.
     - `flagged` = verdict is `changes`.
     - kind `defect`: `pass` = `flagged` and `keys.length > 0`. Kind `clean`: `pass` = verdict is `approve` and `blocking === 0`.
   - `summarize(lines)` groups run lines `{ role, model, kind, pass, flagged, failure, findings, verified, seconds, cost }` by role then model and returns rows `{ role, model, runs, pass, defectRuns, caught, flaggedDefects, cleanRuns, cleanPass, failures (object: failure name -> count), findings, verified, medianSeconds, cost (sum; null values skipped), costPerPass (cost / pass, null when pass is 0) }`, sorted by role, then pass descending, then cost ascending.
   - `table(rows)` returns one Markdown table per role (a `## <role>` heading above each) with columns: Model, Pass, Defects caught, Flagged, Clean approved, Failed runs, Verified findings, Median s, $/run, $/pass. `Failed runs` reads like `2 empty-answer, 1 no-verdict` or `0`. Counts read `7/12`. Money has 4 decimals.
2. New file tests/model-benchmark-squad-score.test.ts: use the real parseVerdict and checkFinding from tools/squad/gate.mjs and a `readFile` over an in-memory map. Cases: a defect case with a `changes` verdict whose finding matches a key passes and lists the key id; the same finding on another file does not pass but `flagged` is true; an `approve` on a defect case fails; a clean case with `approve` and one `low` finding passes; a clean case with `approve` and one `high` finding fails; outcome `empty-answer` fails with that failure; an answer that is prose fails with `no-verdict`; a finding whose quote is at its line counts as verified and one with a made-up quote does not; `summarize` over six lines of two models gives the counts, the median and `costPerPass` null for a model with no pass; `table` output contains the role heading and a `7/12` style cell.

Files: examples/model-benchmark/scripts/squad-score.mjs+, examples/model-benchmark/scripts/squad-score.d.mts+, tests/model-benchmark-squad-score.test.ts+
