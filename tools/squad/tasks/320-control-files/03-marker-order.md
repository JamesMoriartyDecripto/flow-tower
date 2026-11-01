# 320-15: strip Files markers in any order

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: one regex change. Verify: run test on tests/squad-runner-fix-scope.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

Why (security review): controlEntry in tools/squad/runner-core.mjs strips markers once each in a fixed order:
  const path = String(entry).replace(/\s\(optional\)$/, '').replace(/\+$/, '').trim();
so `package.json (optional)+` and `package.json++` (both accepted by parsePlan) are not recognised as control files.

1. Replace those two replace calls with one that strips any trailing run of markers: `.replace(/(\s*\(optional\)|\+)+$/, '')`, keeping `.trim()`.
Append tests to tests/squad-runner-fix-scope.test.ts: controlEntry is true for `package.json (optional)+`, `package.json++` and `package.json+ (optional)`; false for `src/app.js (optional)+`.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts
