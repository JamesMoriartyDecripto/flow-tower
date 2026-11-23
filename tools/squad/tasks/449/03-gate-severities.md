# 449-03: the merge gate decides on the finding severities, not the verdict

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines; never rewrite or empty an existing test file (add to it only).
Read tools/squad/gate.mjs lines 85-140 (readiness), tools/squad/pack.mjs lines 64-71 (FORMAT), tests/squad-gate.test.ts lines 100-130.
Verify: `run typecheck`, then `run test` on tests/squad-gate.test.ts and tests/squad-pack.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#449): gate.mjs:116 adds `<role>: changes requested` for a `changes` verdict, on top of the reasons for critical, high and unknown-severity findings. Measured on #447's stored answers: in 662 of them a `changes` verdict never blocked a head that the severities let through (170 times it blocked a head with medium or low findings only), and since the pack tells both passes to answer `changes` only for a critical or high finding, 31 of 31 verdicts matched the severities. One rule, in one place: the severities.

1. tools/squad/gate.mjs: delete the `changes requested` line in `readiness`. In the comment above `readiness`, add one sentence: the verdict is not a reason since #449, because the pack asks for `changes` exactly when a finding is critical or high and the findings are what the gate reads. `parseVerdict` still requires `approve` or `changes`: a missing verdict stays a malformed answer.
2. tools/squad/pack.mjs FORMAT, the verdict line: replace `the merge gate blocks on changes, and the lead reads every finding either way.` with `the merge gate blocks on critical and high findings, and the lead reads every finding either way.`
3. tests/squad-gate.test.ts: change the test `a changes verdict is a reason` into `a changes verdict with no critical or high finding is not a reason`: the same verdicts, expect `reasons` to equal `[]`. Keep every other test as it is.

Files: tools/squad/gate.mjs, tools/squad/pack.mjs, tests/squad-gate.test.ts
