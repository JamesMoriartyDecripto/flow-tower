# 383: the gate says when a pass saw a trimmed pack

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: no new files, no new helpers beyond what is listed. Verify: run test on tests/squad-gate.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/run.mjs (lines 80-90), tools/squad/pack.mjs (the `[… cut N KB]` marker, line 196) and tools/squad/gate.mjs (reviewedCommit, verdictOf, main).

Why: pack.mjs trims a task over --max-kb and leaves `[… cut N KB]` markers in it. The gate reads only run.mjs output, so READY reads as full coverage even when the pass saw a cut diff.

1. run.mjs: right after the `reviewed:` line, when the task contains one or more `[… cut N KB]` markers, print `trimmed: <sum of N> KB`. Print nothing when there is no marker. It is a header line, printed before the model answers.
2. gate.mjs: export `trimmedKb(text)`: returns the number from line 3 when it matches exactly `/^trimmed: (\d+) KB$/` and line 1 starts with `mode: `, else 0. verdictOf adds `trimmed: trimmedKb(text)`. In main, after the unverified findings, for each verdict with trimmed > 0 print `Note: <role> pass saw a trimmed pack (cut <N> KB): rerun with a larger --max-kb or review the cut part`. It does not change READY.
Append tests to tests/squad-gate.test.ts: trimmedKb gives 37 for "mode: now\nreviewed: <40 hex>\ntrimmed: 37 KB\n{...}", 0 without that line, 0 when the line is on line 4.
Files: tools/squad/run.mjs, tools/squad/gate.mjs, tests/squad-gate.test.ts
