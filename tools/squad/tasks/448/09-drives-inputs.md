# 448-09: review fixes in drives.mjs: a known tower, a plain evidence name

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Never rewrite or empty an existing test file: append one case. Comments explain why, never what the next line does. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/drives.mjs, tests/verify-skill.test.ts.

Why: review and security pass on pull request #454. `eventsDrive` reads `towers[id].id` without checking that the workspace holds that tower: a TypeError stack trace instead of a FAIL line. The evidence file name comes from `--name` unchecked, so `--name ../../x` writes outside the run's evidence folder.

1. In .claude/skills/verify-flow-tower/scripts/drives.mjs: `--name` must match `^[A-Za-z0-9._-]+$` and must not be `.` or `..`; else every drive prints `FAIL --name takes letters, digits, dot, dash and underscore` and exits 1 before it reads, fetches or writes anything. In `eventsDrive`, a project whose tower is missing from `towers` prints `FAIL the workspace has no tower for <id>` and exits 1.
2. Append one test to tests/verify-skill.test.ts: with a temp run folder (run.json with an `evidence` path), `validate examples/starters --run <dir> --name ../escape` exits 1, prints `FAIL --name takes`, and neither `<dir>/escape.json` nor `<dir>/evidence` exists. Explicit `{ timeout: 20000 }`.

Files: .claude/skills/verify-flow-tower/scripts/drives.mjs, tests/verify-skill.test.ts
