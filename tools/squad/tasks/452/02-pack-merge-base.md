# 452-02: pack.mjs diffs from the merge base and prints it

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines; never rewrite or empty an existing test file (add to it only).
Read tools/squad/pack.mjs (the base checks at lines 27-36, `git` at line 73, `reviewedLines` at lines 102-108, the two `git diff` calls at lines 150 and 165, `diffHead` at line 167), tests/squad-pack.test.ts (beforeEach and `run`).
Verify: `run typecheck`, then `run test` on tests/squad-pack.test.ts, tests/squad-pack-paths.test.ts and tests/squad-scripts.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#452): pack.mjs diffs the working tree against the tip of `--base`. When the base moved on after the branch started, its later changes show as reverted by the pull request: on #447, 8 of 17 critical or high findings on such a pack said the PR reverts a CHANGELOG entry and a README sentence merged into main in between.

1. tools/squad/pack.mjs: after `git` is defined, compute `const mergeBase = git('merge-base', base, 'HEAD').trim()`. When git fails (no common commit), write `base has no common commit with HEAD: <base>` to stderr and exit 1. Use `mergeBase` instead of `base` in both `git diff` calls. The `diffHead` text names it: `git diff <first 12 chars of mergeBase> (merge base of <base> and HEAD) -- <paths>`.
2. tools/squad/pack.mjs: the pack header carries `Merge base: <full sha>` and an empty line right after the `Reviewed commit:` line, and also when the tree is dirty and that line is left out.
3. tests/squad-pack.test.ts: a new `it`: after beforeEach, check out main, commit a change to a new file `src/later.ts` (`export const later = 1;`), check out feat again, run pack with `--role reviewer --issue 452`. Expect exit 0, stdout without `later`, stdout with `Merge base: <sha of the first commit>` (read it with `git rev-parse main~1`), and the diff still holding `export const b = 3;`.
4. Continuation: items 1 to 3 are already done in the working tree (adopted from the first run); keep them. The first run was RED because two tests read the old heading text. tests/squad-pack-paths.test.ts line 49: expect stdout to match `/git diff [0-9a-f]{12} \(merge base of main and HEAD\) -- examples/`. tests/squad-scripts.test.ts line 74: expect stdout to match `/git diff [0-9a-f]{12} \(merge base of HEAD and HEAD\) -- lib/`. Change no other line of those two files.

Files: tools/squad/pack.mjs, tests/squad-pack.test.ts, tests/squad-pack-paths.test.ts, tests/squad-scripts.test.ts
