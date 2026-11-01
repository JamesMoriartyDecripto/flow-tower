# 320-21: the open-findings test needs a verifier PASS

Rules: English only; edit only Files; preserve existing work; change only the fixture named below. Verify: run test on tests/squad-runner-core.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

tests/squad-runner-core.test.ts, test 'opens the draft PR with the findings still kept after the fix rounds', returns 'failed' instead of 'pr' because its fake roles have no verifier answer. Other tests that reach the PR pass `verifier: ['PASS']` (see the test at line 86). Add `verifier: ['PASS']` to that test's roles object only.
Files: tests/squad-runner-core.test.ts
