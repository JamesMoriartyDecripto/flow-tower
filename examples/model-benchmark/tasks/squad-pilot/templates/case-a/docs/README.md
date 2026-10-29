# Price formatter

`src/price.mjs` exports `formatPrice(value)`, used by the storefront to show prices.

Intended behaviour: finite numbers become a string with exactly two decimals (`value.toFixed(2)`).
Anything that is not a finite number is refused with a `TypeError`, so a bad value never reaches a page.
