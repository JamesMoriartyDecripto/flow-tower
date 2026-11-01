# 320-19: after the last fix round, open findings go into the draft PR

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum. Verify: run test on tests/squad-runner-fix-scope.test.ts, tests/squad-runner-core.test.ts and tests/squad-runner-contracts.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-core.mjs (workIssue quality loop, prBody) and tests/squad-runner-fix-scope.test.ts.

Why: the fourth external acceptance replay ran triage, plan, three steps and two full fix rounds, then stopped with "findings still open after 2 fix rounds" because the judge kept one dead-CSS finding. The PR is a draft a person reviews, so the open findings belong in it, not in a stop. A kept security finding of severity critical or high still stops.

1. In the quality loop, the line `if (round > limits.fixRounds) stop(`findings still open after ${limits.fixRounds} fix rounds`);` becomes: when round > limits.fixRounds, stop with that same message only if a kept finding has role security and severity critical or high (case-insensitive); otherwise record the kept findings as open (id, file, what) and break, so the verifier and the draft PR follow.
2. prBody takes the open findings and adds an `Open findings (after the last fix round):` section listing `- <id> (\`<file>\`): <what>`, or nothing when there are none. The PR body is already scrubbed.
Append tests to tests/squad-runner-fix-scope.test.ts: with fixRounds 1 and a judge that keeps a reviewer finding every round, workIssue reaches 'pr' and the PR body (written through writeTasks as PR_BODY.md) lists that finding under Open findings; with a kept security finding of severity high every round, it stops with the "findings still open" message.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts
