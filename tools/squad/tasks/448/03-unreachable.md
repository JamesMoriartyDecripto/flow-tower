# 448-03: a drive on a stopped instance says FAIL, not a stack trace

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why; files under ~400 lines. Never rewrite or empty an existing test file: change only the cases named below. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/verify.mjs (workspaceOf near line 220, projectOf, openDrive, eventsDrive), tests/verify-skill.test.ts.

Why: issue #448, found in the live proof. `node verify.mjs open sre-incident` against a run whose server was stopped printed a Node stack trace (`TypeError: fetch failed ... ECONNREFUSED`) from `workspaceOf` and exited 1. An agent that reads this cold needs one line that says what to do. The file is also 408 lines, over the limit.

1. In .claude/skills/verify-flow-tower/scripts/verify.mjs: when the workspace request of `open` or `events` fails (connection refused, a timeout, a status that is not 200, a body that is not JSON), print `FAIL no instance answers at <url>: run doctor, then launch` and exit 1, with no stack trace and without starting a browser. Give that request a 5 s timeout.
2. `planRun` and `parseArgs` are exported only for two tests that assert internal shapes. Remove both `export` keywords and delete those two tests ('puts the run folder under base and puts the port in the runId' and 'reads the command and flags') with their imports. Add one test in their place: a temp run folder whose `run.json` has `"url": "http://127.0.0.1:9"` (nothing listens there) and an `evidence` path; `open anything --run <dir>` exits 1, its output contains `FAIL no instance answers at http://127.0.0.1:9` and does not contain `at async` or `TypeError`. Explicit `{ timeout: 20000 }`.
3. Bring the file under 400 lines by removing duplication you find between `open` and `events` (they share opening the project and reading the state), not by deleting comments that explain why.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts
