/*
 * Number formats shared by every report type, so money and percentages read the same on every page. Both are
 * written by hand rather than with toLocaleString: the output must not depend on the machine's locale, because the
 * same document always gives the same bytes.
 */

/** Money with two decimals and a thousands separator, e.g. `18,420.50 EUR`. The currency is optional. */
export function formatMoney(value: number, currency?: string): string {
  const [whole, fraction] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amount = `${value < 0 ? '-' : ''}${grouped}.${fraction}`;
  return currency ? `${amount} ${currency}` : amount;
}

/** A percentage with one decimal place, always, so `3.0%` reads as a measured figure, not a rounded guess. */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
