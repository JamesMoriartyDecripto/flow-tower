# 448-13: every command names its run; doctor can confirm a project

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Comments explain why, never what the next line does. Whenever a step tightens what a command accepts, update the fixtures and calls in the tests that relied on the old default. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts, .claude/skills/verify-flow-tower/verify-flow-tower.tower.yaml (layer `check`).

Why: issue #448. `<base>/current` is one pointer for the whole machine. Two agents that launch at the same time and then run `doctor` or `stop` without `--run` act on each other's instance. Four agents that used the skill pointed this out. And `doctor` prints only the first five project ids, so an agent cannot confirm that the project it is about to drive is served: the one assertion a run with the skill failed.

1. In .claude/skills/verify-flow-tower/scripts/verify.mjs: remove `current` (no write in `launch`, no read anywhere). `doctor` and `stop` require `--run <dir>`: without it print `FAIL --run <dir> is required: launch prints the run folder` and exit 1. `launch` keeps printing `run <dir>` and also prints the two next commands with that folder filled in (`doctor --run <dir>` and `stop --run <dir>`).
2. `doctor --run <dir> --project <id or prefix>` adds one check after `workspace`: `ok   project: <full id>` when a served project id equals the value or starts with it, else `FAIL project: no project matches <value>` and exit 1. Without `--project` the output is as today.
3. In tests/verify-skill.test.ts: `doctor` and `stop` without `--run` exit 1 with `--run <dir> is required`; with a `node:http` server that answers `/api/workspace` with `{"projects":["a/a.tower.yaml","b/b.tower.yaml"],"towers":{}}` and a run folder whose run.json points at it (no `pid`), `doctor --run <dir> --project b` prints `ok   project: b/b.tower.yaml` and `doctor --run <dir> --project zzz` prints `FAIL project` and exits 1. Explicit timeouts.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts
