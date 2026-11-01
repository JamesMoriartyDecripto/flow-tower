# 367-01: every squad role favours the simplest change

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: change three strings, add one test file. Verify: run test on the new test file plus any existing test that asserts these strings (grep tests/ for "premature optimization" and "Do not comment on style"); finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/config.mjs and tools/squad/pack.mjs.

Why (#367): nothing in the squad checks that a change is the simplest one that meets the task; in #320 security rounds grew 3 steps to 12, one of them duplicating a guard run.mjs already had.

1. tools/squad/config.mjs line 41, STYLE_RULES, ends exactly with `no premature optimization. Never touch secret files.`. Insert before `Never touch secret files.`: `Write the minimum that meets the task: no abstraction, option or check it does not ask for. ` (every role prompt carries STYLE_RULES, so the coder gets it in any project).
2. tools/squad/pack.mjs FOCUS.reviewer: the second line reads exactly `'and files over ~400 lines. Do not comment on style.',`. Change it to `'files over ~400 lines, and unneeded complexity: code or checks the brief does not ask for,',` and add a third line `'a second copy of an existing mechanism, a solution bigger than the task. Do not comment on style.',`.
3. pack.mjs FOCUS.security: the third line reads exactly `'tokens in logs; CSRF. Give a severity per finding (critical, high, medium, low).',`. Add after it: `'Before proposing a new check, name the existing guard that could cover the case; if one covers it, it is not a finding.',`.
Add tests/squad-simplest-change.test.ts: STYLE_RULES contains "Write the minimum"; the packed reviewer and security tasks contain the new focus text (use how existing pack tests build a task, grep tests/ for pack.mjs). If an existing test asserts an old string, change only that string.
Files: tools/squad/config.mjs, tools/squad/pack.mjs, tests/squad-simplest-change.test.ts+
