# 448-14: stop removes the Vite cache of the run's port

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Comments explain why, never what the next line does. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/verify.mjs (stop, readRun, git), bin/flow-tower.js (search `port-`: where the per-port Vite cache folder is set), tests/verify-skill.test.ts.

Why: issue #448. Every server started on a port leaves `node_modules/.vite/port-<port>` in the checkout. Five verification runs left five such folders, and git status cannot show them because node_modules is ignored. The skill's text told the agent to remove the folder by hand; `stop` knows the port and the repository root, so it does it.

1. In .claude/skills/verify-flow-tower/scripts/verify.mjs `stop`: after the server is confirmed stopped (or was already gone), when `run.port` is present remove `<repo root>/node_modules/.vite/port-<run.port>` with `rmSync(..., { recursive: true, force: true })`, where the repo root is `git rev-parse --show-toplevel` as `launch` uses, and print `removed the Vite cache of port <port>` only when that folder existed. The port comes from the checked reader, so it is an integer from 1024 to 65535. Do not remove it when `stop` refused the PID as not this run's server.
2. Append one test to tests/verify-skill.test.ts: a run folder named `r3` with run.json `{ "runId": "r3", "port": 5398 }` (no pid) and a folder `node_modules/.vite/port-5398` created by the test in the repository root with one file in it: `stop --run <dir>` exits 0, prints `removed the Vite cache of port 5398`, and that folder no longer exists. Remove the folder in a `finally` too, so a failing test leaves nothing. Explicit `{ timeout: 20000 }`.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts
