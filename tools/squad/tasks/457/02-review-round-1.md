# 457-02: review round 1 on #459: a private logs folder, git's reason for a failed merge-base, no dead state in pass

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines (run.mjs and prs.mjs are already over: add no more than the lines below).
Read tools/squad/run.mjs lines 136-142 (LOGS), tools/squad/prs.mjs lines 233-245 (pass) and 393-396 (the steward root made 0700), tools/squad/pack.mjs lines 73-82 (mergeBase), tests/squad-pack.test.ts, tests/squad-oneshot.test.ts (the first `it`).
Verify: `run typecheck`, then `run test` on tests/squad-pack.test.ts, tests/squad-oneshot.test.ts and tests/squad-prs.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests, file-size

Why (#459 review round 1, findings kept):
- security, low: run.mjs creates the logs folder with the default mode, while prs.mjs makes the steward folder beside it 0700 because another user of the machine is in the threat model. A log holds the packed code and the model's answer.
- reviewer, low: pack.mjs reports every failed `git merge-base` as "no common commit", but a shallow clone or an unfetched base fails the same way; the real reason is in git's stderr.
- reviewer, low (standards 4): in prs.mjs `pass`, `let last = { code: 1, stdout: '' }` is never read before the loop assigns it.

1. tools/squad/run.mjs: create LOGS with `mode: 0o700`, then `chmodSync(LOGS, 0o700)` (mkdir's mode applies only to a folder it creates), as prs.mjs does for its root. Import chmodSync if needed.
2. tools/squad/pack.mjs: in the catch of the merge-base call, keep the first line `base has no common commit with HEAD: <base>` only when git exits 1 with empty stderr; otherwise write `git merge-base <base> HEAD failed: <git's stderr, trimmed>`. Both exit 1. `execFileSync` errors carry `status` and `stderr`.
3. tools/squad/prs.mjs `pass`: drop the outer `let last`; inside the loop `const last = await runAsync(...)`.
4. tests/squad-oneshot.test.ts, the first `it`: also expect `statSync(dirname(logPath)).mode & 0o777` to be `0o700`.
5. tests/squad-pack.test.ts: a new `it` named `refuses a base with no common commit`: create an orphan branch (`git checkout -q --orphan other`, commit a file, `git checkout -q feat`) and pack with `--base other` (override the run helper's base); expect a non-zero exit and stderr containing `base has no common commit with HEAD: other`.

Files: tools/squad/run.mjs, tools/squad/pack.mjs, tools/squad/prs.mjs, tests/squad-oneshot.test.ts, tests/squad-pack.test.ts
