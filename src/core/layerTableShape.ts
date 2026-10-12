import type { LayerTable } from './docCharts';

/*
 * How a layer table is laid out on the page. Kept apart from the component so the rule that turns a wide
 * table over is a plain function a test can pin down.
 */

/**
 * A table with more columns than this is turned over: its items (runtimes or models) become rows and the
 * layers become columns. A wide table of columns cannot fit a card, so the rows take the items instead.
 */
export const TRANSPOSE_COLUMNS = 8;

export interface ShapedRow { label: string; cells: number[] }

export interface ShapedTable {
  transposed: boolean;
  /** The header cells, the first one naming the row axis. */
  headers: string[];
  rows: ShapedRow[];
}

/** Lays one layer table out for the page: as built, or turned over when it has too many columns. */
export function shapeLayerTable(table: LayerTable, itemHeader: string): ShapedTable {
  if (table.columns.length <= TRANSPOSE_COLUMNS) {
    return {
      transposed: false,
      headers: ['Layer', ...table.columns],
      rows: table.rows.map((r) => ({ label: `${r.code} ${r.title}`, cells: r.counts })),
    };
  }
  return {
    transposed: true,
    headers: [itemHeader, ...table.rows.map((r) => r.code)],
    rows: table.columns.map((c, i) => ({ label: c, cells: table.rows.map((r) => r.counts[i]) })),
  };
}

/**
 * Splits a header into the pieces a browser may break between: after each `/` or `-`, and nowhere else.
 * A model id then wraps at its own seams instead of running past the card. Joining the pieces gives the text back.
 */
export function headerParts(text: string): string[] {
  return text.split(/(?<=[/-])/).filter((p) => p.length > 0);
}
