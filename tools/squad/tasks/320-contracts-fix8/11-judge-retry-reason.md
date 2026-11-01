# 320-11: tell the judge why its answer was refused

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum. Verify: run test on tests/squad-runner-core.test.ts and tests/squad-runner-fix-scope.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-core.mjs (function judge, and makePlan around line 110 for the pattern).

Why (review of 7199568): parseJudgement now refuses answers for specific reasons (supportingFiles over 5, unsafe path), but the retry in judge() only says the answer "could not be read", so the judge can repeat the same mistake. makePlan already passes its error: `Your last plan was refused: ${p.error}. Answer again with a valid plan.`

1. In judge(), keep the last refusal reason: when the role run failed, use `the run failed`; otherwise parseJudgement's `error`. The retry prompt becomes `${prompt}\n\nYour last answer was refused: ${reason}. Answer again with the json block.`
Append a test to tests/squad-runner-fix-scope.test.ts: a first judge answer with 6 supportingFiles makes the second lead-judge prompt contain `supportingFiles allows at most 5 files`.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts, tests/squad-runner-core.test.ts (optional)
