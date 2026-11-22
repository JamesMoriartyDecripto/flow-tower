# 453-01: role logs are written next to the cost ledger, not beside the runner

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines; never rewrite or empty an existing test file (add to it only).
Read tools/squad/ledger.mjs (ledgerPath), tools/squad/run.mjs lines 130-145 (pruneLogs and `const log`), tools/squad/log-prune.mjs, tests/squad-ledger.test.ts, tests/squad-oneshot.test.ts (the first `it`, and `run` with its SQUAD_LEDGER), tests/squad-trusted-cli.test.ts lines 44-56.
Verify: `run typecheck`, then `run test` on tests/squad-ledger.test.ts, tests/squad-oneshot.test.ts and tests/squad-trusted-cli.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: untyped-mjs

Why (#453): run.mjs:138 writes `tools/squad/<role>-<ms>.log` beside its own code. A day of benchmark runs left 2154 logs (116 MB) there, and tests/squad-trusted-cli.test.ts:51 copies the whole folder twice per test, so it timed out at 60 s. The logs belong with the cost ledger in the user folder. Every test and benchmark that spawns run.mjs already sets SQUAD_LEDGER to a temp file, so a logs folder beside the ledger keeps their logs in their own temp folder with no further change.

1. tools/squad/ledger.mjs: export `logsDir(env)`: `env.SQUAD_LOGS` when set and not empty, else `join(dirname(ledgerPath(env)), 'squad-logs')`. A short comment says why the logs live beside the ledger (#453).
2. tools/squad/run.mjs: replace `pruneLogs(HERE)` and `join(HERE, ...)` for the log with the folder from `logsDir(env)`, created with `mkdirSync(dir, { recursive: true })` before the prune. Keep the prune in its try/catch. Update the #357 comment above it.
3. tools/squad/log-prune.mjs: the header comment says the logs are in the logs folder (#453), not beside run.mjs. No code change.
4. tests/squad-ledger.test.ts: a new `it` for `logsDir`: SQUAD_LOGS wins; an empty SQUAD_LOGS is unset; with SQUAD_LEDGER `/x/y.jsonl` it is `/x/squad-logs`; with FLOW_TOWER_HOME `/home/ft` it is `/home/ft/squad-logs`.
5. tests/squad-oneshot.test.ts: in the first `it` (oneshot), read the path printed after `· log ` on the footer line and expect it to be inside `join(dirname(<that test's ledger>), 'squad-logs')` and the file to exist.
6. tests/squad-trusted-cli.test.ts line 51: the `cpSync` of tools/squad skips `*.log` files (`filter`), since an older checkout still holds logs written there before this change.

Files: tools/squad/ledger.mjs, tools/squad/run.mjs, tools/squad/log-prune.mjs, tests/squad-ledger.test.ts, tests/squad-oneshot.test.ts, tests/squad-trusted-cli.test.ts
