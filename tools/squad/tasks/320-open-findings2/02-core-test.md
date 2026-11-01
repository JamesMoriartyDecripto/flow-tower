# 320-20: finish step 19 (keep that work)

Rules: English only; edit only Files; preserve existing work; change only the test named below. Verify: run test on tests/squad-runner-core.test.ts and tests/squad-runner-fix-scope.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

Step 19 (tools/squad/tasks/320-open-findings/01-open-findings-in-draft.md) is implemented in the working tree but not committed: keep all of it. Its only failure: tests/squad-runner-core.test.ts, test 'fails when findings stay kept after the fix rounds' (around line 223), asserts the old stop for a kept reviewer finding. Rename it to 'opens the draft PR with the findings still kept after the fix rounds' and change only its two expectations: workIssue returns 'pr', and calls contains 'draftPr' and does not contain 'fail:findings still open after 1 fix rounds'.
Files: tests/squad-runner-core.test.ts
