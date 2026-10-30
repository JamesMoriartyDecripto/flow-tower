---
id: triage-b
category: triage
check: regex
steps: 5
---
# Triage: file server reads a sibling folder

Synthetic pilot issue for case B (a path guard).

## Prompt

You are the triage role of the dev squad. Read the issue below and route it.

Issue: "A request for `../files-private/notes.txt` returned the content of a file in a folder next to our served root. The served root is `/srv/files`. The guard is `resolveInside` in the guard module."

The repository snapshot you are given is the state before any fix. Do not assume a fix has been applied.

Reply with: the scope (which module), the risk level (low, medium or high) with one sentence why, the roles that should run next and in what order, and anything you cannot decide from the issue alone. Do not invent requirements the issue does not state. End by calling finish with your report.

## Expected

Triage must treat this as a security-relevant path defect in `src/guard.mjs` (`resolveInside`), route it to security review and then to the coder, and must not call it a database or UI issue.

```regex
security
coder
resolveInside|guard
```

```must-not
database|migration|storefront
```
