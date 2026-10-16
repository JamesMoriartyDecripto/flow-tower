---
id: release-plan
category: orchestrator
check: json
steps: 1
---
# Order the steps of a release

From real work: the Flow Tower release procedure (NEXT.md § Releasing, the release-auditor example): gates before the tag.

## Prompt

You plan the steps of a software release. The steps you can use are exactly: `freeze`, `changelog`, `version-bump`, `check`, `e2e`, `audit-report`, `tag`, `publish`, `announce`.

Dependencies:
- `freeze` comes first: nothing merges after it.
- `changelog` and `version-bump` both come after `freeze`; `changelog` before `version-bump`.
- `check` and `e2e` come after `version-bump`; `check` before `e2e` (it is faster and fails early).
- `audit-report` needs the results of `check` and `e2e`.
- `tag` only after `audit-report`.
- `publish` after `tag`, `announce` after `publish`.

Reply with the steps in the one order that meets every dependency, as a JSON array of strings, and nothing else.

## Expected

```json
["freeze","changelog","version-bump","check","e2e","audit-report","tag","publish","announce"]
```
