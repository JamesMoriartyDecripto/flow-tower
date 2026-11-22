# 462-04: the PR steward's passes light the quality nodes

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/prs.mjs lines 225-245 (pass), tools/squad/ev.sh, tests/squad-prs-e2e.test.ts.
Verify: `run typecheck`, then `run test` on tests/squad-prs-e2e.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests

Why (#458, #462): `pass` runs run.mjs with `--node specialists.<role>`, but the reviewer and security nodes of the Dev Squad tower are `quality.reviewer` and `quality.security`. The steward's live events match no node.

1. tools/squad/prs.mjs `pass`: `--node quality.${role}`.
2. tests/squad-prs-e2e.test.ts: one test that runs the steward path as the existing tests do, with `FLOW_TOWER_CLI` set to a small script written in the test's temp folder that appends its `--node` argument to a file, and checks that the recorded nodes are exactly `quality.reviewer` and `quality.security` (each at least once) and none starts with `specialists.`. ev.sh runs a FLOW_TOWER_CLI ending in `.js` with node.

Files: tools/squad/prs.mjs, tests/squad-prs-e2e.test.ts
