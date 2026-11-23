# 457-04: the autopilot planner adds the tests skill to a step that writes a test

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/runner-plan.mjs (taskFiles), tools/squad/runner.mjs lines 98-110 (limits), tools/squad/runner-core.mjs line 255 (the taskFiles call), tests/squad-runner-plan.test.ts (describe taskFiles).
Verify: `run typecheck`, then `run test` on tests/squad-runner-plan.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests

Why (#457): a step that writes a test gets `tools/squad/skills/tests.md` only through a `Skills: tests` line. The lead writes it by hand; the unattended lead's planner (taskFiles) never does, so autopilot steps never see the test rules. A project without that skill file must not get the line: a missing skill stops the run.

1. tools/squad/runner-plan.mjs `taskFiles`: a new option `testSkill` (a skill name, default '' for none). When it is set and a step's files name a test (a path, without its trailing `+`, under a `tests/`, `test/` or `__tests__/` folder, or ending in `.test.<ext>` or `.spec.<ext>`), the task text gets the line `Skills: <testSkill>` right before its `Files:` line, with nothing else changed.
2. tools/squad/runner.mjs: `limits` gets `testSkill: existsSync(join(repo, 'tools', 'squad', 'skills', 'tests.md')) ? 'tests' : ''`; tools/squad/runner-core.mjs passes `testSkill: limits.testSkill` to taskFiles.
3. tests/squad-runner-plan.test.ts: new tests in describe taskFiles: with `testSkill: 'tests'`, the step whose files include `tests/x.test.ts+` has `Skills: tests` right before its Files line, and the step with only `src/` files has no Skills line; without the option, no task has a Skills line.

Files: tools/squad/runner-plan.mjs, tools/squad/runner.mjs, tools/squad/runner-core.mjs, tests/squad-runner-plan.test.ts
