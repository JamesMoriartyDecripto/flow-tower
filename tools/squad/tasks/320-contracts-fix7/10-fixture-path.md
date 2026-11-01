# 320-10: finish step 09 (keep that work)

Rules: English only; edit only Files; preserve existing work; change only the fixture path named below. Verify: run test on tests/squad-runner-contracts.test.ts, tests/squad-runner-fix-scope.test.ts and tests/squad-runner-core.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

Step 09 is implemented in the working tree but not committed: keep all of it. Since step 09, a plan that names tools/squad/ needs a person (SENSITIVE), so tests/squad-runner-contracts.test.ts line 8 stops early. That line has `files: ['tools/squad/runner-core.mjs']`: change only that path to `src/prompts.ts`. If another fixture in the three test files fails for the same reason, change only its path the same way.
Files: tests/squad-runner-contracts.test.ts, tools/squad/runner-core.mjs (optional), tests/squad-runner-fix-scope.test.ts (optional), tests/squad-runner-core.test.ts (optional)
