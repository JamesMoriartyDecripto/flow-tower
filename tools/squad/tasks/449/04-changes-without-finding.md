# 449-04: a changes verdict with no blocking finding is a malformed answer, and the gate says so

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/gate.mjs lines 84-140 (blocks, readiness), tools/squad/pack.mjs FORMAT (lines 64-71), tests/squad-gate.test.ts lines 95-160.
Verify: `run typecheck`, then `run test` on tests/squad-gate.test.ts and tests/squad-pack.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests

Why (#459 review round 3, kept): step 03 dropped the `changes requested` reason, so an answer with `"verdict":"changes"` and no findings, or with only medium and low ones, now reads as READY. The pack asks for `changes` only when a finding is critical or high, so such an answer breaks that rule: it is malformed, and the gate already fails closed on a malformed answer (an unknown severity blocks).

1. tools/squad/gate.mjs `readiness`: after the loop over a verdict's findings, when `v.verdict === 'changes'` and no finding of `v.findings` has `blocks(f.severity)`, push `${v.role}: changes verdict with no critical or high finding, check its findings and run the pass again`. A changes verdict that has a blocking finding adds no extra reason (that finding's reason already blocks).
2. tools/squad/gate.mjs: in the comment above `readiness`, replace the sentence that starts `The verdict is not a reason (#449)` with: `A changes verdict without a critical or high finding breaks the pack's rule, so it is refused like an unknown severity (#449).`
3. tools/squad/pack.mjs FORMAT, the verdict line: replace `the merge gate blocks on critical and high findings, and the lead reads every finding either way.` with `the merge gate blocks on critical and high findings and refuses a "changes" verdict without one, and the lead reads every finding either way.`
4. tests/squad-gate.test.ts: change the test `a changes verdict with no critical or high finding is not a reason` into `a changes verdict with no critical or high finding is a reason`, expecting exactly `['reviewer: changes verdict with no critical or high finding, check its findings and run the pass again']`. Add one test: a changes verdict carrying one verified high finding gives only that finding's reason (build the finding as the existing `a verified high finding is a reason` test does).

Files: tools/squad/gate.mjs, tools/squad/pack.mjs, tests/squad-gate.test.ts
