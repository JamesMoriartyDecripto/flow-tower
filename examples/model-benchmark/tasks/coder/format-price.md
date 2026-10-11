---
id: format-price
category: coder
check: command
command: format-price.check.mjs
steps: 4
---
# Format a model price per million tokens

From real work: `skills/flow-tower-costs/models.mjs` turns OpenRouter's per-token price strings into the per-million prices people compare.

## Prompt

Write a JavaScript ES module that exports a function `formatPrice(p)`.

OpenRouter's public models list gives prices in USD **per token**, as strings (`"0.0000003"`). People compare prices per **million** tokens.

- `p` is a string, a number, `null`, `undefined` or `""`.
- Missing (`null`, `undefined`, `""`) returns `"-"`.
- A negative price means "variable" and returns `"var"`.
- Otherwise return the price per million tokens with a dollar sign and exactly two decimals: `"0.0000003"` gives `"$0.30"`, `"0"` gives `"$0.00"`.
- Watch floating point: `"0.0000025"` must give `"$2.50"`, not `"$2.49"`.

Reply with the complete module in one ```js code block and nothing else.

## Expected

`format-price.check.mjs` checks the missing values, a negative price, zero, and five real prices from the list (0.30, 2.50, 0.04, 15.00, 0.10 per million).
