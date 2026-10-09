import type { Cell } from './extract';
import { pageText } from './docstore';

/** Collapse whitespace and typographic quotes so OCR line breaks do not fail a real quote. */
const norm = (s: string) => s.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Deterministic citation check. A cell survives only if its quote appears verbatim on the
 * cited page. "not found" answers carry no quote and pass. Rejected cells go back to the
 * reviewer once, then to the associate's queue: they are never silently dropped.
 */
export async function verifyCitations(cells: Cell[]): Promise<{ verified: Cell[]; rejected: Cell[] }> {
  const verified: Cell[] = [];
  const rejected: Cell[] = [];
  for (const cell of cells) {
    if (cell.answer === 'not found' && !cell.quote) { verified.push(cell); continue; }
    const page = Number(cell.location.match(/p\.(\d+)/)?.[1]);
    const text = Number.isFinite(page) ? await pageText(cell.docId, page) : '';
    (text && norm(text).includes(norm(cell.quote)) ? verified : rejected).push(cell);
  }
  return { verified, rejected };
}
