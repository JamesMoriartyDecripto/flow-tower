# 448-12: the helper keeps the instance's life only; the canned drives go

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Comments explain why, never what the next line does. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/verify.mjs, .claude/skills/verify-flow-tower/scripts/drives.mjs, tests/verify-skill.test.ts, .claude/skills/verify-flow-tower/verify-flow-tower.tower.yaml (the target design: layers `launch` and `check`).

Why: issue #448. Agents were given the same two tasks with and without this skill. Without it they wrote their own short Playwright script from e2e/fixtures.ts and produced better proof (a blind judge: 28 against 17 of 30), and `validate` needed no helper at all. The canned drives record one moment, show the node idle, and carry an unexplained click timeout. They are removed. Nothing replaces them: the skill's text tells the agent how to write its drive.

1. Delete .claude/skills/verify-flow-tower/scripts/drives.mjs. In verify.mjs remove the `open`, `events` and `validate` commands, their dispatch, their usage lines and every helper only they used. Move `workspaceOf` (the checked reader of /api/workspace: status 200, JSON, `projects` an array, `towers` an object) into verify.mjs, since `launch` and `doctor` use it. `--help` lists `launch`, `doctor` and `stop` only.
2. In tests/verify-skill.test.ts delete the tests of the removed commands (validate on starters, validate on a broken tower, open on a stopped server, the `--name` escape, the evidence path taken from run.json, the server that answers `{}` to `open`). Keep every test of `launch`, `doctor` and `stop`. Replace the `{}` server test with the same server and `doctor --run <dir>`: it exits 1 and prints `FAIL workspace`. The `--help` test names the three commands and asserts the output does not contain `events`.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, .claude/skills/verify-flow-tower/scripts/drives.mjs, tests/verify-skill.test.ts
