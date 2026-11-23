# 456-04: the security pass falls back only to another model, and a failed attempt keeps its stderr

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines; never rewrite or empty an existing test file (add to it only).
Read tools/squad/prs.mjs lines 53-72 (passOutcome, attemptModels), line 176 (runAsync), lines 227-238 (pass), tests/squad-prs.test.ts lines 70-85.
Verify: `run typecheck`, then `run test` on tests/squad-prs.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#456): `attemptModels('security')` returns `[security, security, reviewer]`. Since #447 both default to `minimax/minimax-m3.1-flash`, so the fallback is a third identical try, paid for nothing. And `runAsync` keeps only stdout: when run.mjs fails on stderr (a usage error, no key, a crash), `pass` loses the reason.

1. tools/squad/prs.mjs `attemptModels`: for security, `[models.security, models.security]` when `models.reviewer === models.security`, else `[models.security, models.security, models.reviewer]`. Update the comment above it.
2. tools/squad/prs.mjs `runAsync`: return `stderr` too (`r.stderr`, and `String(e.stderr ?? '')` on failure).
3. tools/squad/prs.mjs `pass`: after an attempt that exits non-zero with a non-empty stderr, write `<role> on <model>: <stderr trimmed>` and a newline to process stderr (`stderr` is already imported from node:process). Nothing else changes.
4. tests/squad-prs.test.ts, `describe('attemptModels')`: a new `it`: with `{ reviewer: 'm', security: 'm' }` security gets `['m', 'm']`. Keep the existing cases.

Files: tools/squad/prs.mjs, tests/squad-prs.test.ts
