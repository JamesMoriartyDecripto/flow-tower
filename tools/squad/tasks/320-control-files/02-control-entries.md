# 320-14: a control file is stopped however the Files entry names it

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: reuse matchesEntry, no new matching logic. Verify: run test on tests/squad-runner-fix-scope.test.ts and tests/squad-runner-core.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-core.mjs, tools/squad/files-check.mjs (matchesEntry, parseFiles) and tests/squad-runner-fix-scope.test.ts.

Why (review of d7dada3): a plan's step files may carry a trailing `+` (new file) or ` (optional)`, and may name a directory or a glob, which files-check.mjs treats as covering every path under or matching it. CONTROL_FILE is tested on the raw entry, so `package.json+`, `package.json (optional)`, `tools/squad`, `.github`, `tools`, `tools/**` and `**` all pass while still granting write scope over control files.

1. In runner-core.mjs add one function `controlEntry(entry)`: strip a trailing ` (optional)` and a trailing `+`, then return true when CONTROL_FILE matches the path, or when matchesEntry(path, c) is true for any of the sample control paths `.github/x`, `tools/squad/x`, `package.json`, `package-lock.json` (import matchesEntry from ./files-check.mjs; say in a comment why: the same rule files-check uses decides what an entry covers).
2. Use controlEntry instead of CONTROL_FILE.test in sensitivePlan and in the fix round.
Append tests to tests/squad-runner-fix-scope.test.ts: plans with step files `package.json+`, `package.json (optional)`, `tools/squad`, `.github`, `tools/**` each stop with the plan sign-off message; a plan with `src/**` and `src/app.js+` reaches 'pr'.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts
