# 462-05: PLAN_ASK keeps its original sentences; the contract test quotes them again

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/runner-core.mjs lines 50-56 (PLAN_ASK), tests/squad-runner-contracts.test.ts lines 165-195.
Verify: `run typecheck`, then `run test` on tests/squad-runner-contracts.test.ts and tests/squad-runner-plan.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#462): step 02 rewrote two sentences of PLAN_ASK that the "architect plan scope" contract test quotes, and changed the test to match. The step only had to add two sentences. A contract test is changed only when the contract changes; here it did not.

1. tools/squad/runner-core.mjs: the second string of PLAN_ASK (the one after `+ '`, before `+ FINISH_JSON`) becomes exactly this text, between the backticks, with the single quote in "runner's" escaped as `\'` as today:
   `[{"title": "...", "items": [1 to 3 strings], "files": ["relative/path", "new/path+"], "reads": ["existing/path"]}]}, with 1 to 8 steps. A "+" marks a new file. "reads" is optional and lists existing files the step must read but not edit (the source of its text or data). Each step is a code change the coder makes with file tools and the project checks; list only the files that step must edit. The runner itself runs the checks, review and verifier and opens the draft PR, so no step does those. Each criterion says what the finished change does, checkable in the code, never the runner's own work (checks, review, records, the pull request). `
2. tests/squad-runner-contracts.test.ts, the first test of describe "architect plan scope": the assertion goes back to `expect(prompts.architect).toContain('opens the draft PR, so no step does those');`. The second test of that describe stays as it is.

Files: tools/squad/runner-core.mjs, tests/squad-runner-contracts.test.ts
