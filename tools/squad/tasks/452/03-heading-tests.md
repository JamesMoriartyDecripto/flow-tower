# 452-03: the two tests that read the diff heading name the merge base

Rules: English only; never touch secret files; edit only the files named below; comments explain why; never rewrite or empty an existing test file (change only the lines named).
Read tests/squad-pack-paths.test.ts line 49, tests/squad-scripts.test.ts line 74, tools/squad/pack.mjs `diffHead`.
Verify: `run typecheck`, then `run test` on tests/squad-pack-paths.test.ts, tests/squad-scripts.test.ts and tests/squad-pack.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why: step 02 (kept local, not to be changed) made the heading read `git diff <12-char merge base> (merge base of <base> and HEAD) -- <paths>`, which is what the diff is now taken from. Two tests still expect the old text `git diff main -- examples` and `git diff HEAD -- lib`.

1. tests/squad-pack-paths.test.ts line 49: expect stdout to match `/git diff [0-9a-f]{12} \(merge base of main and HEAD\) -- examples/`.
2. tests/squad-scripts.test.ts line 74: expect stdout to match `/git diff [0-9a-f]{12} \(merge base of HEAD and HEAD\) -- lib/`.
3. Change nothing in tools/squad/pack.mjs or tests/squad-pack.test.ts.

Files: tests/squad-pack-paths.test.ts, tests/squad-scripts.test.ts, tools/squad/pack.mjs (optional), tests/squad-pack.test.ts (optional)
