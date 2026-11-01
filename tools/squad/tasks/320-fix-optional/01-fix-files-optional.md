# 320-17: fix-round Files are a scope, not a must-touch list

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum. Verify: run test on tests/squad-runner-fix-scope.test.ts and every tests/*.test.ts that imports files-check.mjs or step-scope.mjs (grep); finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/files-check.mjs (parseFiles), tools/squad/step-scope.mjs (main: write and stageOf) and tools/squad/runner-judge.mjs (fixTask).

Why: the third external acceptance replay stopped in the fix round: a finding quoted README.md, the coder fixed it correctly in src/index.html only, and files-check failed with "missing README.md". In a fix round the Files line bounds where the coder may write; it is not a list each entry of which must change. steps.sh already stops a step that changes nothing. Separately, parseFiles drops "(optional)" entries, and step-scope uses it for the write dirs and the staged files, so an optional entry outside the write dirs is never committed (also a bug for ordinary tasks).

1. files-check.mjs: parseFiles(taskText, { all = false } = {}): with all true it keeps the "(optional)" entries, marker removed (the "+" is removed as today). Default behaviour unchanged. step-scope.mjs: both parseFiles calls in main (write and stageOf) pass { all: true }, with a comment why (an optional file may be written, so it is in scope).
2. runner-judge.mjs fixTask: the line `Files: ${files.join(', ')}` lists each entry with " (optional)" appended, with a comment why.
Append tests: parseFiles with { all: true } keeps `README.md (optional)` as `README.md`; default still drops it; fixTask's Files line marks every entry optional and parseFiles(text, { all: true }) round-trips the paths. If an existing assertion on the exact fixTask Files line breaks, update only that expected string.
Files: tools/squad/files-check.mjs, tools/squad/step-scope.mjs, tools/squad/runner-judge.mjs, tests/squad-runner-fix-scope.test.ts, tests/squad-runner-judge.test.ts (optional)
