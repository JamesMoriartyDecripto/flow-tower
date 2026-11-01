# 320-08: say where parent links are stopped

Rules: English only; edit only Files; change only the comment named below, no code. Verify: run test on tests/squad-runner-fix-scope.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

Why: tools/squad/runner-core.mjs lines 29-30 read exactly:
// A Files path must be a regular file or a path that does not exist yet (a fix may create it). lstat, not stat, so a
// symbolic link is seen as a link: following it could point the fix at a file outside the worktree.
lstat checks only the last segment. A link in a parent folder is stopped by run.mjs, which checks every coder write on its real path (#169), so the core needs no second walk-up check (KISS). Replace those two lines with:
// A Files path must be a regular file or a path that does not exist yet (a fix may create it). lstat, not stat, so a
// link in the last segment is seen as a link. A link in a parent folder is left to run.mjs, which checks every coder
// write on its real path (#169).
Files: tools/squad/runner-core.mjs
