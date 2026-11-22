# 462-01: the fix task carries lead-judge's reason for each kept finding

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/runner-judge.mjs (judgeBody, fixTask), tools/squad/runner-core.mjs lines 266-296 (the quality round), tests/squad-runner-judge.test.ts (describe parseJudgement, describe fixTask), tests/squad-runner-fix-paths.test.ts lines 10-55, tests/squad-runner-core.test.ts lines 30-45 and 209-221.
Verify: `run typecheck`, then `run test` on tests/squad-runner-judge.test.ts, tests/squad-runner-fix-paths.test.ts, tests/squad-runner-fix-scope.test.ts (unchanged, it must stay green) and tests/squad-runner-core.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests

Why (#462): lead-judge keeps a finding with a reason, but the fix task gives the coder only the reviewer's `fix` text. On #460 the reviewer's fix was conditional ("if the sentence is not in the README, drop it"); the coder found the sentence and changed nothing, so the step went red and the issue failed, although the judge had kept the finding for another reason.

Data shape: `parseJudgement` answers `{ ok: true, keep: [{ id, reason }], drop: [{ id, reason }] }` (plus `supporting` as today). Kept and dropped entries have the same shape.

1. tools/squad/runner-judge.mjs: `judgeBody` pushes `{ id, reason }` to `keep`, as it does for `drop`. `fixTask` writes each item as today and, when the finding has a nonempty string `reason`, appends ` Kept because: <reason>` to that item (inside the same `<finding-data>` fence, through stripFence like the rest). The sentence before the fence becomes: "The review and the security pass found these defects in this pull request, and lead-judge kept each one for the reason after it. Fix each item as its reason says and nothing else: where a fix depends on a condition, the reason decides." Update the comments above parseJudgement that describe the result shape.
2. tools/squad/runner-core.mjs: the kept findings come from the judgement's keep list and carry its reason: build a Map id -> reason from `j.keep`, keep the findings whose id is in it, each as `{ ...f, reason }`. Add `f.reason` to the text the sensitive-area check reads (`keptText`), since the reason now reaches the coder too. Nothing else changes.
3. Tests: update the existing `keep` expectations to the new shape. Add in describe fixTask: a kept finding with a reason shows `Kept because: <reason>` inside the fence; one without a reason has no `Kept because`. Add in tests/squad-runner-core.test.ts, next to "writes a fix task and runs the steps again for one kept finding": the text of the written 91-review-fixes.md task contains the judge's keep reason (capture it through the `writeTasks` override, as the PR body test at line 392 does).

Files: tools/squad/runner-judge.mjs, tools/squad/runner-core.mjs, tests/squad-runner-judge.test.ts, tests/squad-runner-fix-paths.test.ts, tests/squad-runner-core.test.ts
