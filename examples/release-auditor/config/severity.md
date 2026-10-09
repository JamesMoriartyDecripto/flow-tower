# Severity

| Level | Meaning | Release |
|---|---|---|
| **Blocker** | Crash, data exposure, secret in history, a documented core flow that does not work | Fix before the tag |
| **Major** | Wrong result or broken flow with a workaround; docs that send users to the wrong place | Fix before the tag unless the maintainer defers it |
| **Minor** | Cosmetic, rare edge case, missing polish | Issue with reproduction, may ship |

Every finding carries: commit, steps or a failing test, expected vs actual, file:line, finder, verifier verdict.
