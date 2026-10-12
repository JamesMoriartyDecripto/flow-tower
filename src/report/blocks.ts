/*
 * Renders one content block to HTML. Each block kind is a small function, so the page reads like its model.
 * Every citation is checked against the document's sources: a draft that cites a missing source is an error,
 * not a silent broken link, because the reader could not check the claim.
 */

import { esc } from './escape.ts';
import { SEVERITIES, type BarItem, type Block, type Finding, type StatusItem } from './model.ts';

const DEFAULT_FILL = '#c2410c';
/*
 * One palette for every bar: severities and RAG colours share it, so a "high" bar and a "red" bar read as the
 * same family of colour on the page. Unknown tones fall back to the accent, never to an invented colour.
 */
const TONE_FILL: Record<string, string> = {
  critical: '#7f1d1d',
  high: '#ea580c',
  medium: '#d97706',
  low: '#1e40af',
  info: '#6b7280',
  red: '#b91c1c',
  amber: '#d97706',
  green: '#15803d',
  neutral: '#6b7280',
};

/** Statuses that close a finding: it is still listed, but muted so the open ones stand out. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['fixed', 'closed', 'accepted']);
const RAG_VALUES: ReadonlySet<string> = new Set(['red', 'amber', 'green']);

export function renderBlock(block: Block, sourceIds: ReadonlySet<string>): string {
  switch (block.kind) {
    case 'text':
      return renderText(block.text, block.origin, block.cites ?? [], sourceIds);
    case 'facts':
      return renderFacts(block.rows);
    case 'table':
      return renderTable(block.columns, block.rows, block.caption);
    case 'findings':
      return renderFindings(block.items, sourceIds);
    case 'bars':
      return renderBars(block.caption, block.unit, block.items);
    case 'status':
      return renderStatus(block.items);
    case 'list':
      return renderList(block.items, block.ordered === true);
  }
}

/** Citations as [S1] links to the sources appendix. An unknown id is an error, never a dead link. */
export function renderCites(cites: readonly string[], sourceIds: ReadonlySet<string>): string {
  return cites
    .map((id) => {
      if (!sourceIds.has(id)) throw new Error(`report cites unknown source "${id}"`);
      return `<a class="rs-cite" href="#src-${esc(id)}">[${esc(id)}]</a>`;
    })
    .join(' ');
}

function renderText(
  text: string,
  origin: 'data' | 'draft',
  cites: readonly string[],
  sourceIds: ReadonlySet<string>,
): string {
  // A model's prose must say where it came from, or it is not allowed into the report.
  if (origin === 'draft' && cites.length === 0) {
    throw new Error('draft text must cite at least one source');
  }
  const badge = origin === 'draft' ? '<span class="rs-badge">drafted</span>' : '';
  const refs = cites.length > 0 ? ` ${renderCites(cites, sourceIds)}` : '';
  return `<p class="rs-text">${badge}${esc(text)}${refs}</p>`;
}

function renderFacts(rows: readonly [string, string | number][]): string {
  const body = rows
    .map(([label, value]) => `<tr><th>${esc(label)}</th>${tdOpen(value)}${tableCell(label, value)}</td></tr>`)
    .join('');
  return `<table class="rs-table rs-facts"><tbody>${body}</tbody></table>`;
}

/*
 * Short values (an id, a date, a time, a number) must not break over two lines in a narrow column, so their cell
 * is marked nowrap. The value decides, not the column, so the rule holds in every table and fact row.
 */
const SHORT_VALUE = /^(?:[A-Z]{1,3}-\d+|\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?: UTC|Z)?)?|\d{2}:\d{2}(?::\d{2})?(?: UTC)?|-?\d[\d,.]*%?)$/;

export function isShortValue(cell: string | number): boolean {
  return typeof cell === 'number' || SHORT_VALUE.test(cell.trim());
}

/** The opening `<td>` for a cell: numbers are right-aligned, and short values never wrap. */
function tdOpen(cell: string | number): string {
  const classes = [typeof cell === 'number' ? 'rs-cell-num' : '', isShortValue(cell) ? 'rs-nowrap' : '']
    .filter((c) => c !== '');
  return classes.length > 0 ? `<td class="${classes.join(' ')}">` : '<td>';
}

function renderTable(
  columns: readonly string[],
  rows: readonly (readonly (string | number)[])[],
  caption: string | undefined,
): string {
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = row
        .map((cell, i) => `${tdOpen(cell)}${tableCell(columns[i] ?? '', cell)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const cap = caption ? `<caption>${esc(caption)}</caption>` : '';
  return `<table class="rs-table">${cap}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/*
 * A cell in a column named Severity, RAG or Status shows the same chip as the cards when its value is a
 * severity or a RAG colour. A fact row labelled Overall, Status or RAG gets the same chip. The chip is only drawn
 * for a known value, so other text is still plain escaped text.
 */
function tableCell(column: string, cell: string | number): string {
  const name = column.trim().toLowerCase();
  const value = typeof cell === 'string' ? cell.trim().toLowerCase() : '';
  if (name === 'severity' && (SEVERITIES as readonly string[]).includes(value)) {
    return `<span class="rs-chip rs-sev-${value}">${esc(value)}</span>`;
  }
  if ((name === 'rag' || name === 'status' || name === 'overall') && RAG_VALUES.has(value)) {
    return `<span class="rs-chip rs-rag-${value}">${esc(value)}</span>`;
  }
  return esc(cell);
}

function renderFindings(items: readonly Finding[], sourceIds: ReadonlySet<string>): string {
  // The summary is one line: the per-severity counts already sit in the summary section, so no table repeats them.
  const counts = SEVERITIES.map((sev) => ({ sev, n: items.filter((f) => f.severity === sev).length }))
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} ${c.sev}`);
  const total = items.length;
  const line = total === 0 ? '0 findings' : `${total} ${total === 1 ? 'finding' : 'findings'}: ${counts.join(', ')}`;
  const cards = items.map((f) => renderFinding(f, sourceIds)).join('');
  return `<p class="rs-finding-count">${esc(line)}</p>${cards}`;
}

function renderFinding(f: Finding, sourceIds: ReadonlySet<string>): string {
  const ref = f.ref ? `<span class="rs-ref">${esc(f.ref)}</span>` : '';
  const status = f.status ? `<p class="rs-finding-line"><strong>Status:</strong> ${esc(f.status)}</p>` : '';
  const rec = f.recommendation
    ? `<p class="rs-finding-line"><strong>Recommendation:</strong> ${esc(f.recommendation)}</p>`
    : '';
  const cites = f.cites && f.cites.length > 0 ? `<p class="rs-finding-line">${renderCites(f.cites, sourceIds)}</p>` : '';
  // A closed finding keeps its place and its chip, but its card is muted so open work stands out.
  const closed = f.status !== undefined && CLOSED_STATUSES.has(f.status.trim().toLowerCase());
  const cls = closed ? `rs-finding rs-sev-${f.severity} rs-finding-closed` : `rs-finding rs-sev-${f.severity}`;
  return (
    `<article class="${cls}">` +
    `<header class="rs-finding-head"><span class="rs-chip rs-sev-${f.severity}">${f.severity}</span>` +
    `<span class="rs-fid">${esc(f.id)}</span>${ref}<h4>${esc(f.title)}</h4></header>` +
    `<p class="rs-finding-line">${esc(f.detail)}</p>${rec}${status}${cites}</article>`
  );
}

/*
 * Horizontal bars as one inline SVG: label | bar | value. The bars share the largest value as their full
 * length, so the proportions read true. Labels are text in the SVG, so they stay escaped like all text.
 */
function renderBars(
  caption: string,
  unit: string | undefined,
  items: readonly BarItem[],
): string {
  const LABEL_W = 180;
  const BAR_W = 300;
  const VALUE_W = 90;
  const ROW = 22;
  const max = Math.max(0, ...items.map((i) => (Number.isFinite(i.value) ? i.value : 0)));
  const rows = items
    .map((item, i) => {
      const y = i * ROW;
      const value = Number.isFinite(item.value) ? Math.max(0, item.value) : 0;
      const width = max > 0 ? (value / max) * BAR_W : 0;
      const fill = TONE_FILL[item.tone ?? ''] ?? DEFAULT_FILL;
      const shown = item.shown ?? (unit ? `${value} ${unit}` : `${value}`);
      return (
        `<text x="${LABEL_W - 6}" y="${y + 15}" text-anchor="end" font-size="11">${esc(item.label)}</text>` +
        `<rect x="${LABEL_W}" y="${y + 4}" width="${BAR_W}" height="12" fill="#e5e7eb"/>` +
        `<rect x="${LABEL_W}" y="${y + 4}" width="${width.toFixed(2)}" height="12" fill="${fill}"/>` +
        `<text x="${LABEL_W + BAR_W + 6}" y="${y + 15}" font-size="11">${esc(shown)}</text>`
      );
    })
    .join('');
  const width = LABEL_W + BAR_W + VALUE_W;
  const height = Math.max(1, items.length) * ROW;
  return (
    `<figure class="rs-bars"><figcaption>${esc(caption)}</figcaption>` +
    `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(caption)}">${rows}</svg></figure>`
  );
}

function renderStatus(items: readonly StatusItem[]): string {
  // The word is printed with the colour, so the status still reads in greyscale.
  const body = items
    .map((item) => {
      const note = item.note ? esc(item.note) : '';
      return (
        `<tr><td>${esc(item.label)}</td>` +
        `<td><span class="rs-chip rs-rag-${item.rag}">${item.rag}</span></td><td>${note}</td></tr>`
      );
    })
    .join('');
  return `<table class="rs-table rs-status"><thead><tr><th>Item</th><th>Status</th><th>Note</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderList(items: readonly string[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const body = items.map((item) => `<li>${esc(item)}</li>`).join('');
  return `<${tag} class="rs-list">${body}</${tag}>`;
}
