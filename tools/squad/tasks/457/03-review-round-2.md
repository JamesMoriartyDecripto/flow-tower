# 457-03: review round 2 on #459: no forced chmod of the logs folder

Rules: English only; never touch secret files; edit only the files named below; comments explain why; add no lines to run.mjs (over 400 already).
Read tools/squad/run.mjs lines 1-20 (imports) and 136-145 (LOGS).
Verify: `run typecheck`, then `run test` on tests/squad-oneshot.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#459 review round 2, reviewer, medium): step 02 added `chmodSync(LOGS, 0o700)` after the mkdir. It also runs on a folder the user named with SQUAD_LOGS, and when the chmod fails (a folder owned by another user, a mount that refuses chmod) run.mjs throws before any request. The mode of mkdirSync already makes a folder the run creates private; an existing folder is the user's choice.

1. tools/squad/run.mjs: delete the `chmodSync(LOGS, 0o700);` line and `chmodSync` from the node:fs import if nothing else uses it. The comment above becomes: `// A log holds the packed code and the model's answer, so a folder the run creates is private (#459).`
2. Keep the `mode: 0o700` on mkdirSync and the 0o700 assertion in tests/squad-oneshot.test.ts as they are: the test's logs folder is new, so it still holds.

Files: tools/squad/run.mjs, tests/squad-oneshot.test.ts (optional)
