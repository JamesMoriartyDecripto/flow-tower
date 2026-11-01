# 320-08: fix files must stay inside the worktree through every parent

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Files under 400 lines, comments explain why. Verify: run test on tests/squad-runner-fix-scope.test.ts and tests/squad-runner-core.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-core.mjs and tests/squad-runner-fix-scope.test.ts.

Why (security review of 332f234): isDirOrLink in tools/squad/runner-core.mjs (around line 32) lstats only the last segment. A path `link/passwd`, where `link` is a symlink in the worktree pointing outside it, passes, although the comment promises a fix never points outside the worktree.

1. Extend that check: besides the current directory/link test on the path itself, find the nearest existing ancestor of the path (walk up with dirname until it exists, stopping at the worktree), take realpathSync of it and of wt.path, and stop with the same FILES_NOT_REGULAR message when the ancestor's real path is not the worktree's real path or inside it (compare with path.sep, so `/wt2` is not inside `/wt`). A path whose parents do not exist yet stays allowed when its nearest existing ancestor is inside.
Append tests to tests/squad-runner-fix-scope.test.ts with a temp worktree: a supporting file `linked/passwd` where `linked` is a symlink to a temp folder outside stops before writeTasks; `newdir/deeper/a.ts` (parents missing) is allowed; a sibling folder whose name starts with the worktree name is outside.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts
