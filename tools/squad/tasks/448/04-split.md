# 448-04: the drives move to their own module

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why. Behaviour must not change: every command prints, writes and exits as before. Do not edit the tests. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts.

Why: issue #448. verify.mjs is 419 lines, over the project's 400-line limit, and it holds two jobs: the life of an instance (launch, doctor, stop) and the drives that use one (open, events, validate).

1. New file .claude/skills/verify-flow-tower/scripts/drives.mjs: move `workspaceOf`, `resolveProject`, `evidenceOf`, `writeEvidence`, `readState`, `openAsUser`, `inBrowser`, `projectOf`, `drive`, `openDrive`, `postEvent`, `eventsDrive` and `validateDrive` there, with their comments. It exports only `openDrive`, `eventsDrive` and `validateDrive`. Each takes what it needs as arguments (the parsed args, the run read from run.json, the repo root): drives.mjs must not import verify.mjs.
2. In verify.mjs: `main` loads drives.mjs with a dynamic `import()` only for the three drive commands, so `--help`, `launch`, `doctor` and `stop` still load nothing else. Remove what moved. Each file ends under 300 lines.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, .claude/skills/verify-flow-tower/scripts/drives.mjs+
