# 448-10: a failed browser drive keeps a Playwright trace

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Do not edit the tests. Comments explain why, never what the next line does. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read .claude/skills/verify-flow-tower/scripts/drives.mjs (inBrowser, drive).

Why: issue #448. The first browser drive after a launch failed 3 times in about 15 on the card click, with the library on screen, and never in 13 attempts to reproduce it. The call log differed between failures (the card found but never stable; the card not found). A screenshot and a call log cannot settle it: a trace records the DOM and the network at each step.

1. In .claude/skills/verify-flow-tower/scripts/drives.mjs, in the browser drives only (`open`, `events`): create the page from a browser context, start `context.tracing.start({ screenshots: true, snapshots: true })` before the first navigation, and at the end call `context.tracing.stop({ path })` with `<evidence>/<label>.trace.zip` only when the drive failed; a drive that passed stops the trace without a path, so nothing is written. Print the trace path with the other `wrote` lines. A failure while saving the trace must not hide the drive's own FAIL line or its JSON.

Files: .claude/skills/verify-flow-tower/scripts/drives.mjs
