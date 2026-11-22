# 447-07: the pack says when to answer changes

Rules: English only; edit only Files; write the minimum; comments explain why. Never rewrite or empty an existing test file: append one case. Verify: run test on tests/squad-pack.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/pack.mjs (the FORMAT array, lines 62-73), tools/squad/gate.mjs (BLOCKING_SEVERITY, readiness), tests/squad-pack.test.ts.

Why: issues #447 and #449. The pack asks for `"verdict":"approve"|"changes"` and a severity per finding but never says when to answer `changes`, while the gate blocks on `changes` and on critical or high findings. On heads with no blocking defect, 62 of 97 failed reviews were a `changes` verdict whose findings were all medium or low. Each model decided by temperament.

1. In tools/squad/pack.mjs add one line to FORMAT, right after the JSON shape line: `verdict is "changes" when at least one finding is critical or high, and "approve" otherwise, even when there are medium or low findings: the merge gate blocks on changes, and the lead reads every finding either way.` Keep its comment short: why the rule is stated (the gate blocks on changes).
2. Append one test to tests/squad-pack.test.ts that packs a task the way the existing tests do and asserts the output contains `verdict is "changes" when at least one finding is critical or high`.

Files: tools/squad/pack.mjs, tests/squad-pack.test.ts
