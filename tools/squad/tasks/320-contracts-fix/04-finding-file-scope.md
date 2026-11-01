# 320-04: same strict path rule for every Files entry of a fix task

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Files under 400 lines, comments explain why. Verify: run test on tests/squad-runner-fix-scope.test.ts, tests/squad-runner-judge.test.ts and tests/squad-runner-core.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-judge.mjs, tools/squad/runner-core.mjs and tests/squad-runner-fix-scope.test.ts.

Why (security review of 5457d66): the finding's own file reaches the Files line through insideRepo only (runner-judge.mjs:107), which allows commas, so a reviewer finding with file "src/a.ts, .git/config" adds a second path. The protected-path regex (runner-judge.mjs:56, `const PROTECTED = /(^|\/)(\.git|\.env)(\.[^/]*)?(\/|$)/;`) is case-sensitive, so `.GIT/config` passes; on macOS/Windows it is the real folder.

1. Make PROTECTED case-insensitive (`/i`).
2. In fixTask, after the :line suffix is stripped, a kept finding file that is inside the repository but fails isConcreteFile makes the whole task fail closed (return null), exactly like an unsafe supporting file. Findings outside the repository keep today's behaviour (left out). Ordinary finding files such as `src/index.html:12` and `src/a.ts:3-9` keep working.
3. In runner-core.mjs the stop message after a null fixTask is today exactly: `kept findings name no file inside the repository`. Change it to: `kept findings name no safe file inside the repository`. Update any existing test asserting the old text by changing only that string.
Append tests to tests/squad-runner-fix-scope.test.ts: finding file "src/a.ts, .git/config" gives null; `.GIT/config` and `.ENV` refused by isConcreteFile and as supporting files; `src/index.html:12` still gives "Files: src/index.html".
Files: tools/squad/runner-judge.mjs, tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts, tests/squad-runner-core.test.ts (optional)
