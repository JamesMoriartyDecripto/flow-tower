# 448-06: review fixes in verify.mjs: a safe PID, one port check, no dead code

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Never rewrite or empty an existing test file: change only what is named. Comments explain why, never what the next line does: delete a comment that restates the code. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts.

Why: review of #448. `signalRun` refuses `pid <= 0` but lets pid 1 through, and `process.kill(-1, signal)` signals every process the user owns. run.json is read from disk, so a corrupt or hand-edited file must never reach a kill. The rest is dead code and wrong comments left by earlier steps.

1. In .claude/skills/verify-flow-tower/scripts/verify.mjs:
   - `readRun`: with no run folder, print `FAIL run.json: no run folder (launch first, or pass --run)` and return null, through an explicit branch (today `readFileSync(undefined)` throws and the catch hides it). After parsing, a `pid` that is present must be an integer greater than 1: else print `FAIL run.json: pid <value> is not a server PID` and return null. A run.json without `pid` stays valid (the validate drive needs only `evidence`).
   - `signalRun`: keep the guard as a second line of defence, as `pid > 1`, and remove the fallback `process.kill(pid, signal)`: launch always spawns detached, so when the group is gone the PID is gone too. Keep the comment that says the server runs detached in its own process group.
   - `launch`: replace `(await probe(url)) || (await tcpOpen(args.port))` with the TCP check alone, named `portInUse(port)`: a server that answers HTTP also accepts the connection. `planRun` returns `dir` and `launch` uses it instead of building the path again. Move the child env into `isolatedEnv(home)`, with one comment: without its own FLOW_TOWER_HOME the server reads the user's config and can join a hub as a satellite.
   - Remove the `import.meta.url` entry guard and the `now` parameter of `planRun`: nothing imports this file. Call `main` directly.
   - Comments: delete those that restate the code. Fix or delete the wrong ones: line 38 ("Pure"), line 60 (the ISO stamp does contain ':', the regex removes it), line 107 (pid 0 is the caller's own group; the every-process case is pid 1). Keep the comment at the spawn that says the child holds its own copy of the log descriptor.
2. In tests/verify-skill.test.ts: replace the comment block at the top with one line that says what is true (every test spawns the script; none starts a server or a browser). Add one test: a temp run folder whose run.json has `"pid": 1`; `doctor --run <dir>` exits 1 and prints `FAIL run.json: pid 1 is not a server PID`. Use `doctor` for this, never `stop`. Merge the two `--help` tests into one that names all six commands.

Continuation: the first attempt is in both files and is right. Its check was red because three existing fixtures in tests/verify-skill.test.ts write `"pid": 0` as a placeholder, which the new validation refuses. The task forbade touching them: that was the lead's mistake. Remove the `pid` field from those three fixtures (the validate test, the stopped-server test, the broken-tower test) and change nothing else in them.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, tests/verify-skill.test.ts
