/**
 * A text value as a quoted CSS string, for a custom property the @page margin boxes read with content: var(…).
 * A raw `"` or `\` would end the string early (or start an escape), so both are escaped; a line break is
 * written as the CSS hex escape, since a CSS string cannot hold one.
 */
export function cssString(text: string): string {
  const escaped = text.replace(/[\\"]/g, (ch) => `\\${ch}`).replace(/\r?\n/g, '\\A ');
  return `"${escaped}"`;
}
