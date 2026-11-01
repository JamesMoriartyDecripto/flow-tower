# 320-18: split the fix-scope tests under 400 lines

Rules: English only; edit only Files; move tests, do not change them. Verify: run test on tests/squad-runner-fix-scope.test.ts and tests/squad-runner-fix-paths.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

Why: tests/squad-runner-fix-scope.test.ts is 443 lines; the repo rule is files under ~400 lines.
1. Move the describe blocks that test pure functions without workIssue (isConcreteFile, parseJudgement, fixTask, controlEntry, parseFiles) into a new tests/squad-runner-fix-paths.test.ts, with the imports and helpers they need. Leave the workIssue describe blocks where they are. Both files under 400 lines; the total number of tests stays the same.
Files: tests/squad-runner-fix-scope.test.ts, tests/squad-runner-fix-paths.test.ts+
