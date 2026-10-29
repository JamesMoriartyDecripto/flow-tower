---
id: reviewer-a
category: reviewer
check: regex
steps: 4
---
# Reviewer: faulty price formatter

Synthetic pilot reviewer task. This excerpt has a real defect.

## Prompt

You are the reviewer role of the dev squad. Review the change below. Report only defects you can quote from the code shown.

File: `src/price.mjs`

```js
// Formats a price for the storefront: two decimals, no currency sign.
export function formatPrice(value) {
  return Number(value).toFixed(2);
}
```

Brief: `formatPrice` must reject NaN, Infinity and strings with a TypeError, and format finite numbers exactly with toFixed(2).

Answer with JSON only, no prose around it:
{"verdict":"approve"|"changes","findings":[{"severity":"critical|high|medium|low","file":"path:line","quote":"exact line text","what":"...","why":"...","fix":"..."}]}

Use "changes" when any finding is critical or high. End by calling finish with that JSON as the report.

## Expected

The verdict must be "changes". A finding must quote the `return Number(value).toFixed(2);` line and say that NaN, Infinity or a string is coerced and formatted instead of rejected with a TypeError.

```regex
"verdict"\s*:\s*"changes"
toFixed
NaN|Infinity|string|coerce|TypeError
```

```must-not
"verdict"\s*:\s*"approve"
```
