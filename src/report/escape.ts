/*
 * Escaping for the two places document text enters output. Every text goes through esc(), so a title with a
 * tag or a quote stays text and never becomes markup. cssString() serves the one place a value enters CSS
 * (the running header), and it also escapes "<" so a title cannot close the <style> element.
 */

export function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function cssString(value: string): string {
  const body = value
    .replace(/[\\"]/g, '\\$&')
    .replace(/[\r\n\f]/g, ' ')
    .replace(/</g, '\\3c ');
  return `"${body}"`;
}
