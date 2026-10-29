---
id: triage-a
category: triage
check: regex
steps: 5
---
# Triage: storefront shows NaN and Infinity prices

Synthetic pilot issue for case A (a price formatter).

## Prompt

You are the triage role of the dev squad. Read the issue below and route it.

Issue: "Since the last release the storefront sometimes shows NaN or Infinity as a price, and a price that arrives as the text '12.5' is shown without a clear error. The formatter is `formatPrice` in the price module."

The repository snapshot you are given is the state before any fix. Do not assume a fix has been applied.

Reply with: the scope (which module), the risk level (low, medium or high) with one sentence why, the roles that should run next and in what order, and anything you cannot decide from the issue alone. Do not invent requirements the issue does not state. End by calling finish with your report.

## Expected

Triage must route this to the coder for `src/price.mjs` (`formatPrice`), name it as a correctness defect, and must not send it to security.

```regex
formatPrice|price
coder
```

```must-not
security (review|audit) (is )?(required|needed)
database|migration
```
