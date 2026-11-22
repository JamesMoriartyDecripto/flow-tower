# 447-03: run benchmark tasks through a squad loop role

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why; files under ~400 lines. Never print or read the API key. Verify: run test on tests/model-benchmark-squad-loop.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read examples/model-benchmark/scripts/squad-roles.mjs (copy its style: arg, runChild, lastLedgerLine, the worker pool, resume), examples/model-benchmark/scripts/tasks.mjs (loadTasks), tools/squad/runner-deps.mjs lines 20-45 (reportOf: how a loop run's report is cut out of stdout).

Why: issue #447. The architect and the lead-judge of the unattended runner are tool-loop roles of tools/squad/run.mjs. They are measured on the existing tasks/planner and tasks/judge sets, through run.mjs itself, and judged with the existing scripts/judge.mjs and scripts/report.mjs, which read bench.mjs lines.

1. New file examples/model-benchmark/scripts/squad-loop.mjs:
   `node scripts/squad-loop.mjs --role <architect|lead-judge> --category <name> --tasks <folder> --models a,b --out <file.jsonl> [--only id1,id2] [--runs 3] [--parallel 4] [--steps 8] [--squad <tools/squad dir>] [--timeout 600] [--dry-run]`.
   - `loadTasks(<folder>)` gives the tasks; `--only` keeps the listed task ids. No task left: exit 1.
   - `--dry-run` prints `models × tasks × runs = N runs` and exits 0 without spawning anything.
   - Jobs are run-major with models interleaved. A job whose `{ model, task, run }` is already in `--out` is skipped.
   - One job: write the task's `prompt` to a fresh file in a temp folder (`mkdtempSync(join(tmpdir(), 'squad-loop-'))`), spawn `process.execPath` with `[<squad>/run.mjs, '--role', role, '--model', model, '--task', file, '--repo', task.dir, '--issue', '0', '--steps', String(steps)]`, env `SQUAD_LEDGER` = a fresh file in that temp folder and `FLOW_TOWER_URL` = `http://127.0.0.1:9`; kill after `--timeout` seconds.
   - The answer is the child's stdout without its header lines (`mode:`, `reviewed:`, `trimmed:` at the top) and without the footer (the last line starting with `--- ` and the blank line before it). Export this as `reportOf(stdout)`.
   - Append one line per job to `--out` in the shape bench.mjs writes: `{ date (YYYY-MM-DD), category, task: task.id, model, run, warm: false, effort: 'low', ok, firstOutputMs: null, totalMs, steps, retries: 0, promptTokens, completionTokens: 0, cachedTokens, cachedFirstStep: 0, cost, providers: [], answer, error }`. `steps`, `cost`, `promptTokens`, `cachedTokens` come from the last ledger line. `ok` is true and `error` null only when the ledger outcome is `finish`; otherwise `answer` is null and `error` is the outcome (`timeout` when killed, `crash` when there is no ledger line).
   - Print one short line per job. At most `--parallel` at once. Remove the temp folder at the end.
   - Export the pure helpers `planJobs({ tasks, models, runs })` and `reportOf(stdout)`; run the CLI only when the file is the entry script.
2. New file tests/model-benchmark-squad-loop.test.ts: `planJobs` order and count; `reportOf` drops a `mode:`/`reviewed:` header and the `--- model · ...` footer and keeps a report that itself contains a `---` line in the middle; `--dry-run` through `execFileSync` (explicit `{ timeout: 20000 }`) on examples/model-benchmark/tasks/judge with two models and `--runs 2` prints `2 models × 3 tasks × 2 runs = 12 runs`; with `--only steps-scope` it prints `1 tasks`.

Files: examples/model-benchmark/scripts/squad-loop.mjs+, tests/model-benchmark-squad-loop.test.ts+
