# 448-11: run.json is parsed once at the boundary; every error ends in one FAIL line

Rules: English only; edit only Files; write the minimum; plain functions; files under ~400 lines. Never rewrite or empty an existing test file: change only what is named and append cases. Comments explain why, never what the next line does. Verify: run test on tests/verify-skill.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read .claude/skills/verify-flow-tower/scripts/verify.mjs (readRun, stop, launch, main), .claude/skills/verify-flow-tower/scripts/drives.mjs (inBrowser, drive, evidenceOf), tests/verify-skill.test.ts.

Why: review round 2 on pull request #454. Two classes of defect were fixed one case at a time and came back:
- run.json is read from disk and its fields are trusted one by one. `stop` builds a RegExp from `run.port`, so `"port": ".*"` matches any flow-tower server and signals it. `run.evidence` and `run.home` are joined and written or removed wherever the file says.
- an error outside a drive's own expectations prints a stack trace: `main` has no catch, and a failed `chromium.launch` (Chrome not installed) or context setup in `inBrowser` escapes.

1. In .claude/skills/verify-flow-tower/scripts/verify.mjs, `readRun(dir)` becomes the only place that reads run.json, and it returns a checked value or prints one `FAIL run.json: <reason>` and returns null:
   - `runId` must be a string equal to the base name of `dir` when `pid` is present (a launched run); fixtures without `pid` need no `runId` check.
   - `pid`, when present: an integer greater than 1. `port`, when present: an integer from 1024 to 65535.
   - `url`, when present: exactly `http://127.0.0.1:<port>` when `port` is present; else it must start with `http://127.0.0.1:` followed by digits only.
   - `evidence` and `home` are never taken from the file: the returned value always has `evidence: join(dir, 'evidence')` and `home: join(dir, 'home')`.
   - `stop` matches the process command line with plain `String.includes` on `--port <port>` followed by a space or the end, built from the checked integer, with no RegExp from file content. Remove the base-name check from `stop` now that `readRun` does it.
   - `launch` creates `<base>` with mode 0o700 and, when it already exists, refuses a folder not owned by the current user (`statSync(base).uid !== process.getuid()`): `FAIL <base> belongs to another user: pass --base`, exit 1. Skip the owner check where `process.getuid` is undefined.
   - `main(...)` gets one `.catch`: print `FAIL <first line of the error message>` and exit 1. No stack trace reaches the terminal.
2. In .claude/skills/verify-flow-tower/scripts/drives.mjs: `inBrowser` catches a failure of the browser launch, the context, the tracing start and the screenshot the same way as a failure of the drive itself: it becomes the drive's FAIL line and its `error` in the evidence JSON. A launch failure whose message says the browser is not installed adds `: install Google Chrome, the drives use the installed browser`.
3. In tests/verify-skill.test.ts: fix the header comment so it is true for every test in the file. Fixtures that set `evidence` keep working because the value is ignored: the tests assert on `<dir>/evidence`. Append two tests: a run folder named `r2` with run.json `{ "runId": "r2", "pid": <process.pid>, "port": ".*", "url": "http://127.0.0.1:5399" }`: `stop --run <dir>` exits 1 and prints `FAIL run.json: port`; a run folder whose run.json has `"evidence": "<another temp dir>/elsewhere"`: `validate examples/starters --run <dir> --name v` exits 0, `<dir>/evidence/v.json` exists and `<another temp dir>/elsewhere` does not. Explicit timeouts.

Files: .claude/skills/verify-flow-tower/scripts/verify.mjs, .claude/skills/verify-flow-tower/scripts/drives.mjs, tests/verify-skill.test.ts
