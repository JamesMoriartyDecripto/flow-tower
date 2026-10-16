---
id: squad-plan
category: orchestrator
check: json
steps: 1
---
# Plan the squad steps for a change

From real work: the Flow Tower dev squad (`tools/squad/README.md`): a lead picks which roles run on a change, in order.

## Prompt

You lead a small software squad. The roles you can schedule are exactly: `coder`, `tester`, `reviewer`, `security`, `doc-writer`, `release`.

Rules:
1. Every change that edits code starts with `coder`, and `tester` runs right after the last `coder`.
2. `reviewer` runs on every change that edits code, after `tester`.
3. `security` runs only when the change touches authentication, tokens, file paths built from user input, or anything a remote request reaches; it runs after `reviewer`.
4. `doc-writer` runs when user-facing behaviour or a documented command changes; it runs after all code roles.
5. `release` runs only when the change is a version release, and always last.
6. A change that edits only documentation runs `doc-writer` alone.
7. No role appears twice.

For each change, give the ordered list of roles. Reply with a JSON array of 4 arrays, in order, and nothing else.

1. "Fix: the hub accepted a token after it was revoked (src/server/auth.ts)."
2. "Fix a typo in docs/getting-started.md."
3. "Add a --json flag to `flow-tower validate` and document it."
4. "Refactor an internal helper in src/core/layout.ts, no behaviour change."

## Expected

```json
[["coder","tester","reviewer","security"],["doc-writer"],["coder","tester","reviewer","doc-writer"],["coder","tester","reviewer"]]
```
