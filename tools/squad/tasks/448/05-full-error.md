# 448-05: a failed drive keeps the full error in its evidence

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why; files under ~400 lines. Never rewrite or empty an existing test file: append one case. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/drives.mjs (drive, inBrowser, openDrive), tests/verify-skill.test.ts.

Why: issue #448, found in the live proof. One `open` printed `FAIL locator.click: Timeout 30000ms exceeded.` and wrote a JSON with empty `steps`. Playwright's message goes on with a call log that says why the click waited (not stable, covered by another element, detached). The drive kept only the first line, so the failure could not be explained, and it did not come back in 9 repeats.

1. In .claude/skills/verify-flow-tower/scripts/drives.mjs: when a drive fails, the `FAIL` line on stdout stays one line (the first line of the message), and the evidence JSON gains `error`: the whole message as thrown, every line. A drive that succeeds writes no `error` field. This applies to `open`, `events` and `validate` (for `validate`, `error` is `validate exited <code>`).
2. Append one test to tests/verify-skill.test.ts: `validate` on a temp folder that holds one broken tower file (`name: Broken`, one layer `a` with node `x` and the edge `x -> nowhere`) with `--run <temp run folder>` exits 1, prints one line starting with `FAIL validate exited`, and its evidence JSON has `exit: 1` and an `error` that starts with `validate exited`. Explicit `{ timeout: 60000 }`.

Files: .claude/skills/verify-flow-tower/scripts/drives.mjs, tests/verify-skill.test.ts
