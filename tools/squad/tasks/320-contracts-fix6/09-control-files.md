# 320-09: runner and CI files need a person; only regular files pass

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: two small edits, no new helpers. Verify: run test on tests/squad-runner-fix-scope.test.ts, tests/squad-runner-core.test.ts and tests/squad-runner-judge.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-core.mjs and tests/squad-runner-fix-scope.test.ts.

Why (review of f2b8fd4): a judge's supportingFiles can name the runner's own files or CI, e.g. `.github/workflows/ci.yml`, `tools/squad/squad.json`, `package.json`; those must need a person, like the other sensitive areas. And the on-disk check lets FIFOs or unreadable paths through.

1. tools/squad/runner-core.mjs line 11 reads exactly:
const SENSITIVE = /auth|billing|payment|migration|permission|secret|privacy|personal|pii|gdpr/i;
Add to the alternation: `\.github\/|tools\/squad\/|package(-lock)?\.json`. Add a one-line comment why (files that run CI or the runner itself).
2. In the lstat check function near the top of runner-core.mjs: an existing path passes only when `s.isFile()`; in the catch, only `err.code === 'ENOENT'` counts as "does not exist yet" (allowed); any other error refuses the path.
Append tests to tests/squad-runner-fix-scope.test.ts: a kept finding with supporting `.github/workflows/ci.yml` stops with the fix-sensitive message before writeTasks; same for `tools/squad/squad.json`; a FIFO (mkfifo via child_process execFileSync, skip the case on win32) in a temp worktree stops before writeTasks.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts
