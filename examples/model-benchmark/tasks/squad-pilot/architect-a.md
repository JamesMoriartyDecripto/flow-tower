---
id: architect-a
category: architect
check: regex
steps: 5
---
# Architect: plan the price formatter fix

Synthetic pilot planning task for case A.

## Prompt

You are the architect role of the dev squad. Plan the change; do not write code.

Project: the case directory is the repository root. The module is `src/price.mjs` and it exports `formatPrice(value)`. Its tests are in `tests/price.test.mjs`, and `docs/README.md` describes the intended behaviour. Do not assume any fix has been applied: read the current module first.

Plan the change as ordered steps. For each step give the file, what changes and the check that proves it. Name the dependencies between steps and the gate that must pass before the next step starts. Only `src/` may be written by the coder.

End by calling finish with your plan.

## Expected

The plan must keep the `toFixed(2)` output for finite numbers, reject non-finite numbers and strings with a `TypeError`, change only `src/price.mjs`, and gate on the offline check and the existing tests.

```regex
TypeError
toFixed
src/price\.mjs
(tests?|check)
```

```must-not
rewrite the storefront|new (database|service)
```
