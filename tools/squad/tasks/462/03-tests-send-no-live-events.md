# 462-03: test runs never send live events to a real viewer

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tests/global-tmp.ts, tools/squad/ev.sh lines 26-30, tests/squad-trusted-cli.test.ts (how it sets FLOW_TOWER_URL).
Verify: `run typecheck`, then `run test` on tests/squad-oneshot.test.ts and tests/squad-trusted-cli.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#462): many squad tests spawn run.mjs without FLOW_TOWER_URL, so ev.sh posts to its default, http://127.0.0.1:5317, the port of the user's own viewer. Three test files alone aimed 108 events there. A few tests set a dead port by hand; the rest do not. The setting belongs once in the global test setup, which every worker and every child it spawns inherits.

1. tests/global-tmp.ts: before the workers start, set `env.FLOW_TOWER_URL` to `http://127.0.0.1:1` (no listener: events fail fast and reach no viewer), always, even when the caller exported another URL: a test must never light the user's tower. Save the old value and restore it in the teardown, exactly as TMPDIR is restored (extend `restore` to accept the key). Update the file's header comment in one sentence with the reason.
2. Leave the tests that already set their own FLOW_TOWER_URL as they are: their own value still wins for their children.

Files: tests/global-tmp.ts
