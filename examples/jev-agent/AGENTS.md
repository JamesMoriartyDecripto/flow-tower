# AGENTS.md

Instructions for any coding agent working in this repository. The harness reads two
sections mechanically: every bullet under **Done means** becomes a completion question,
and every bullet under **Preferences** is checked against each diff hunk at Stop.
Keep each bullet to one checkable sentence. Mark a preference `(blocking)` only when a
violation must stop the turn; the rest come back as advisory notes.

## Project

TypeScript service, Node 22, Vitest. Source in `src/`, tests next to the code as
`*.test.ts`. `npm run check` runs typecheck, lint and the unit suite.

## Done means

- The tests covering every changed file ran after the last edit and passed.
- `npm run check` passed after the last edit, or the final message says which part failed and why.
- CHANGELOG.md has an entry under [Unreleased] whenever a file in src/ changed.
- The final message lists the changed files and the check that proved them.

## Preferences

- (blocking) No credential, token or private key appears in source, tests or fixtures.
- (blocking) Exported functions keep their names and signatures unless the request asked for a breaking change.
- A bare TODO or FIXME without a ticket reference (e.g. TODO(PAY-123)) is a violation.
- Errors that reach an HTTP handler are caught there and returned as a message the caller can act on.
- No new module-level mutable state; pass dependencies in.
- No new abstraction alongside an existing one that does the same job (a second HTTP client, a second logger).
- Comments explain why, not what the next line does.

## Commands

- `npm run check` (all gates), `npx vitest run <file>` (one test file)
- Never: `git push --force`, `git reset --hard`, editing `.github/workflows/`.
