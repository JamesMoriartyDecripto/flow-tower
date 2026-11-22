# 448-08: review fixes in verify.mjs: a clean env, a checked stop, a checked port

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Never rewrite or empty an existing test file: append cases. Comments explain why, never what the next line does. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts.

Why: review and security pass on pull request #454. The instance is called isolated, but `isolatedEnv` copies the whole parent environment and only overrides FLOW_TOWER_HOME: a shell with FLOW_TOWER_HUB or FLOW_TOWER_TOKEN set would make the scratch server join that hub with that credential. `stop` signals the process group of a PID read from disk without checking that the PID is still this run's server: after a reboot the number can belong to another process.

1. In .claude/skills/verify-flow-tower/scripts/verify.mjs:
   - `isolatedEnv(home)`: start from the parent environment without any variable whose name starts with `FLOW_TOWER_`, then set `FLOW_TOWER_HOME` and `FLOW_TOWER_NO_UPDATE_CHECK`. The comment says why: a hub or token variable from the shell would defeat the isolation.
   - `stop`: before any signal, read the process's command line with `execFileSync('ps', ['-o', 'command=', '-p', String(pid)])`. Signal only when it contains `flow-tower.js` and `--port <run.port>`. A PID that is gone is still `stopped pid <pid>` (already stopped). A live PID whose command line does not match prints `FAIL pid <pid> is not this run's server: nothing was signalled` and exits 1 without removing anything. Export nothing for this.
   - `stop` removes `<run>/home` only when the run folder's base name equals `run.runId`; else it prints `FAIL <dir> is not a run folder of this script` and exits 1.
   - `launch`: `--port` must be an integer from 1024 to 65535, else print `--port needs a number from 1024 to 65535` and exit 2 before anything else. Write `<base>/current` only after the instance is ready, so a failed launch never replaces the pointer to a good run.
2. Append to tests/verify-skill.test.ts: `launch --port abc --base <temp dir>` exits 2 with `--port needs a number` and creates nothing in the temp dir. A temp run folder named `r1` whose run.json has `"runId": "r1"`, `"port": 5399` and `"pid"` set to the PID of this test process (`process.pid`), plus a `home` folder inside: `stop --run <dir>` exits 1, prints `is not this run's server`, the `home` folder still exists, and the test process is still running (the assertion after it executes). Explicit `{ timeout: 20000 }`.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts
