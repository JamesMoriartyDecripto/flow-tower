---
id: security-b
category: security
check: json
steps: 4
---
# Security: clean price formatter (control)

Synthetic pilot security control. The excerpt is judged on its own content.

## Prompt

You are the security role of the dev squad. Audit the change below. Threat model: the value comes from a tower file written by someone else (a cloned repository), and the page runs on the user's laptop. A finding counts only if you can give a concrete input that changes what the user sees or reads.

Scope is lexical: this excerpt handles a single value and no path, file system or network access. Judge only the code shown.

File: `src/price.mjs`

```js
export function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('formatPrice expects a finite number');
  }
  return value.toFixed(2);
}
```

Report exploitable issues only, most severe first. Answer with JSON only, no prose around it:
{"verdict":"approve"|"changes","findings":[{"severity":"critical|high|medium|low","file":"path:line","quote":"exact line text","what":"...","why":"...","fix":"..."}]}

Use "changes" only when a real critical or high issue exists. This is a one-request review with no tools: return the JSON directly.

## Expected

```json
{"verdict":"approve","findings":[]}
```
