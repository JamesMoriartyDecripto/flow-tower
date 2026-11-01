# 386: the coder changes only the lines the task needs

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: one sentence changed in one string. Verify: run test on tests/squad-prompt.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/config.mjs (STYLE_RULES, line 41) and tests/squad-prompt.test.ts.

Why: on a real project a one-line route added to a 398-line file made the coder shorten unrelated comments to stay under ~400 lines. The diff got noise the lead had to review.

1. In STYLE_RULES replace `files under ~400 lines;` with `files under ~400 lines, but change only the lines the task needs: if a file would pass ~400 lines, say so in Known gaps instead of trimming other code;`. Change nothing else in the string.
Append a test to tests/squad-prompt.test.ts: STYLE_RULES contains `change only the lines the task needs` and `say so in Known gaps instead of trimming other code`.
Files: tools/squad/config.mjs, tests/squad-prompt.test.ts
