// Formats a price for the storefront: two decimals, no currency sign.
export function formatPrice(value) {
  return Number(value).toFixed(2);
}
