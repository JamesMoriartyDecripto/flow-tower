# 320-16: plan steps hold only code changes

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: one sentence added to a prompt. Verify: run test on tests/squad-runner-contracts.test.ts and tests/squad-runner-core.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-core.mjs (PLAN_ASK) and tests/squad-runner-contracts.test.ts.

Why: in the external acceptance replay the architect wrote a last step "run npm run check and inspect the served page; prepare a draft PR", listing every page file. The coder cannot open a browser or a PR; it polished two files, left src/index.html untouched, and files-check stopped the issue. The runner, not a step, runs the checks, review, verifier and draft PR.

1. In PLAN_ASK (tools/squad/runner-core.mjs), after the sentence `A "+" marks a new file. ` and before FINISH_JSON, add: `Each step is a code change the coder makes with file tools and the project checks; list only the files that step must edit. The runner itself runs the checks, review and verifier and opens the draft PR, so no step does those. `
Append a test to tests/squad-runner-contracts.test.ts: the architect prompt contains `list only the files that step must edit` and `opens the draft PR, so no step does those`.
Files: tools/squad/runner-core.mjs, tests/squad-runner-contracts.test.ts
