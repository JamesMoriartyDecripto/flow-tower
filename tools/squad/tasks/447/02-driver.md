# 447-02: run squad review cases through run.mjs, one line per run

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why; files under ~400 lines. Never print or read the API key. Verify: run test on tests/model-benchmark-squad-roles.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read examples/model-benchmark/scripts/squad-score.mjs, examples/model-benchmark/tasks/squad-review/cases.json, tools/squad/ledger.mjs (ledgerPath: SQUAD_LEDGER), tools/squad/run.mjs lines 315-400 (what a one-request run prints and records), examples/model-benchmark/scripts/bench.mjs lines 1-80 (argument style, --dry-run).

Why: issue #447. The October squad benchmark was run with a script nobody committed, so it cannot be repeated. This driver runs packed review tasks through the squad's own runner and scores each run with squad-score.mjs.

1. New file examples/model-benchmark/scripts/squad-roles.mjs:
   `node scripts/squad-roles.mjs --cases <cases.json> --packs <dir> --models a,b --out <file.jsonl> [--roles reviewer,security] [--runs 3] [--parallel 4] [--squad <tools/squad dir>] [--repo <git repo>] [--timeout 600] [--dry-run]` and `node scripts/squad-roles.mjs --report <file.jsonl>`.
   - Defaults: roles `reviewer,security`, runs 3, parallel 4, squad = `tools/squad` of the git root this script is in, repo = that git root.
   - A pack is `<packs>/<case id>.<role>.md`. Before any run, every pack must exist: else list the missing ones and exit 1.
   - `--dry-run` prints `models × cases × roles × runs = N runs`, the pack check, and exits 0 without spawning anything.
   - The jobs are every (run, case, role, model), run-major with models interleaved. A job whose `{ model, role, case, run }` already has a line in `--out` is skipped, so an interrupted run resumes.
   - One job: spawn `process.execPath` with `[<squad>/run.mjs, '--role', role, '--model', model, '--task', pack, '--oneshot', '--issue', String(case.issue), '--repo', repo]`, with `SQUAD_LEDGER` set to a fresh file in a temp folder made with `mkdtempSync(join(tmpdir(), 'squad-roles-'))` (so the benchmark never writes the user's cost ledger) and `FLOW_TOWER_URL` set to `http://127.0.0.1:9` (no live events). Kill it after `--timeout` seconds: outcome `timeout`. Read the last line of that ledger file for `outcome`, `cost`, `promptTokens`, `cachedTokens`; no line means outcome `crash`. The answer is the child's stdout from the third line on (line 1 is `mode:`, line 2 is `reviewed:`).
   - Score with `scoreRun`, importing `parseVerdict` and `checkFinding` from `<squad>/gate.mjs` by dynamic import; `readFile(path)` is `git show <case.head>:<path>` in `--repo` through `execFileSync` with an argument array, returning null on failure or when `path` contains `..` or starts with `/` or `-`.
   - Append one JSON line per job to `--out` as it ends: `{ ts, role, model, case, kind, run, seconds, outcome, cost, promptTokens, cachedTokens, ...scoreRun result, answer }`. Print one short line per job (`ok` or `FAIL`, model, role, case, seconds, cost).
   - At most `--parallel` jobs at once. Remove the temp folder at the end.
   - `--report <file>` reads the lines, calls `summarize` and prints `table`.
   - Export the pure helpers `planJobs({ cases, roles, models, runs })`, `doneKey(line)` and `answerOf(stdout)`; run the CLI only when the file is the entry script.
2. New file tests/model-benchmark-squad-roles.test.ts: `planJobs` order (run-major, models interleaved) and count; `answerOf` drops the first two lines; `--dry-run` through `execFileSync` (explicit `{ timeout: 20000 }`) on a temp folder with a two-case cases.json and its four pack files prints the run count and exits 0; with one pack missing it exits 1 and names the missing file.

Files: examples/model-benchmark/scripts/squad-roles.mjs+, tests/model-benchmark-squad-roles.test.ts+
