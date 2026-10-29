---
id: architect-b
category: architect
check: regex
steps: 5
---
# Architect: plan the file guard fix

Synthetic pilot planning task for case B.

## Prompt

You are the architect role of the dev squad. Plan the change; do not write code.

Project: the case directory is the repository root. The module is `src/guard.mjs` and it exports `resolveInside(root, requested)`, a pure function that never touches the disk. Its tests are in `tests/guard.test.mjs`, and `docs/README.md` describes the intended behaviour. Do not assume any fix has been applied: read the current module first.

Plan the change as ordered steps. For each step give the file, what changes and the check that proves it. Name the dependencies between steps and the gate that must pass before the next step starts. Only `src/` may be written by the coder.

End by calling finish with your plan.

## Expected

The plan must replace the string prefix test with a segment-aware test (path.relative or an equivalent), reject sibling folders that share the root's name prefix and `..` escapes, keep legitimate paths under root, stay pure, and gate on the offline check.

```regex
relative|segment
sibling|prefix
\.\.
(tests?|check)
```

```must-not
realpath|fs\.|symlink
database|new service
```
