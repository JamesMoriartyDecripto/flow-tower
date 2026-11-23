# 462-09: the autopilot's worktree lives beside the repo, not in the user folder

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/runner-deps.mjs lines 58-100 (makeDeps, worktree), tests/squad-runner-deps.test.ts lines 20-35 and 66-125 (setup, describe worktree).
Verify: `run typecheck`, then `run test` on tests/squad-runner-deps.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests

Why (#462): `worktree()` puts the worktree in `<home>/squad-runner/worktrees/<repo>-<n>`, inside the user folder that holds the keys. Flow Tower refuses to read files in the user folder, so on this repo the autopilot's check failed 149 tests in that worktree (#460 run). The lead path already uses a folder beside the repo (`../wt-<n>`).

Data shape: the worktree path is `join(dirname(repo), `${basename(repo)}-squad`, String(issue.number))`, for example `/Users/x/Documents/flow-tower-squad/460`. The lock, the task files and the outputs stay under `<home>/squad-runner` as today.

1. tools/squad/runner-deps.mjs `worktree`: build the path as above and create its parent folder (`<parent>/<repo>-squad`) with `mkdirSync(..., { recursive: true })` instead of `<home>/squad-runner/worktrees`. Everything else in `worktree` stays (the leftover removal, fetch, add, setup). Import `dirname` from node:path. One short comment says why (the user folder holds the keys, and Flow Tower refuses files there).
2. tests/squad-runner-deps.test.ts describe worktree: the expected path is `join(dirname(repo), 'flow-tower-squad', '7')` (the test repo folder is named `flow-tower`), and the leftover test creates its folder at that path; a new assertion checks the path is not under `home`. Keep every other test as it is.

Files: tools/squad/runner-deps.mjs, tests/squad-runner-deps.test.ts
