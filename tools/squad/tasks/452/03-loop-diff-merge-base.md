# 452-03: the loop's diff tool also diffs from the merge base

Rules: English only; never touch secret files; edit only the files named below; comments explain why; never rewrite or empty an existing test file (add to it only).
Read tools/squad/run.mjs lines 40-58 (--base checks) and line 207 (`diff` in RUNS), tests/squad-grep-tool.test.ts (setup, run, RUN_DIFF and the test `starts the diff with the commit list of the base..HEAD range`).
Verify: `run typecheck`, then `run test` on tests/squad-grep-tool.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests, file-size

Why (#452, found by the tower check): step 02 made pack.mjs diff from the merge base, but a `--loop` reviewer's `diff` tool still runs `git diff <base>` at run.mjs:207. An explicit --base must be an ancestor of HEAD (run.mjs:49-51), so the fault is the squad.json base (default origin/main) after it moved on: its later changes show as reverted, as on #447. Same fault, so the same fix.

1. tools/squad/run.mjs line 207: inside `diff`, take `git('merge-base', base, 'HEAD').trim()` and pass it to `git diff` instead of `base`. Keep the `${base}..HEAD` log as it is (that range already excludes the base's own commits). One or two lines; run.mjs is over 400 lines, so add nothing else.
2. tests/squad-grep-tool.test.ts, `describe('squad diff tool')`: a new `it` named `does not show changes the base gained after the branch started`: a temp repo with a commit on `main`, a branch `feat` with a change to `a.txt`, then a commit on `main` adding `later.txt`, back on `feat`; write `tools/squad/squad.json` with `{"base": "main"}` in that repo (and commit nothing else) so the run uses that base without --base; run with `--repo` that repo and RUN_DIFF then FINISH. Expect the tool content to contain the `a.txt` change and not `later.txt`. The old code shows `later.txt` as deleted.
3. Continuation: items 1 and 2 are done in the working tree (adopted from the first run) and are right; keep them as they are. The first run was RED only because the lead edited other files during it. Run the Verify line and finish.

Files: tools/squad/run.mjs (optional), tests/squad-grep-tool.test.ts (optional)
