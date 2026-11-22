# 462-07: the autopilot installs the project's dependencies in its fresh worktree

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/runner-deps.mjs lines 1-30 and 84-96 (must, worktree) and line 147 (loadConfig of the main checkout), tools/squad/config.mjs lines 95-106 and 125-140 (command checks, commandArgv), tests/squad-runner-deps.test.ts lines 1-35 and 66-95 (fakeExec, setup, describe worktree) and 128-140 (a test that writes the main checkout's squad.json).
Verify: `run typecheck`, then `run test` on tests/squad-runner-deps.test.ts and tests/squad-config.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests

Why (#462): `worktree()` adds a fresh worktree from origin/main and nothing installs the project's dependencies there, so the first step's `npm run check` cannot find tsc or vitest and goes red on any project with dependencies.

Data shape: `commands.setup` in squad.json, an optional command string (e.g. `npm ci`), checked like every other command (a string, no shell syntax) and split with `commandArgv`. It is read from the main checkout's squad.json (`loadConfig(repo)`), never the worktree's: the worktree's copy is the coder's to edit, and setup runs before any review.

1. tools/squad/runner-deps.mjs `worktree`: after `git worktree add`, when `loadConfig(repo).commands.setup` gives an argv, run it with `exec(argv[0], argv.slice(1), { cwd: path, env: envWithoutKey(), timeout: 15 * 60 * 1000 })` through `must(..., 'setup')`, so a failure throws `setup: <first stderr line>` and the issue stops. No setup command means no call. One short comment says why (a fresh worktree has no dependencies; the command comes from the main checkout).
2. tools/squad/squad.json: add `"setup": "npm ci"` inside `commands`, after `"test"`. Change nothing else in that file and keep its formatting.
3. tests/squad-runner-deps.test.ts, describe worktree: with a main-checkout squad.json whose `commands.setup` is `npm ci` (and a worktree-side squad.json that says `evil install`, written into the path the worktree gets, if the test can place it), the call after `worktree add` is `npm` with args `['ci']`, its cwd is the worktree path and its env has no OPENROUTER_API_KEY; with no setup command there is no call after `worktree add`; a setup that exits 1 with stderr `boom` throws `setup: boom`.

Files: tools/squad/runner-deps.mjs, tools/squad/squad.json, tests/squad-runner-deps.test.ts
