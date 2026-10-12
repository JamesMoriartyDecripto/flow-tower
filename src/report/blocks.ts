/*
 * Renders one content block to HTML. Each block kind is a small function, so the page reads like its model.
 * Every citation is checked against the document's sources: a draft that cites a missing source is an error,
 * not a silent broken link, because the reader could not check the claim.
 */

import { esc } from './escape.ts';
import { SEVERITIES, type Block, type Finding, type StatusItem } from './model.ts';

const DEFAULT_FILL = '#c2410c';
const TONE_FILL: Record<string, string> = {
  red: '#b91c1c',
  amber: '#d97706',
  green: '#15803d',
  muted: '#94a3b8',
};

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
    .map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`)
    .join('');
  return `<table class="rs-table rs-facts"><tbody>${body}</tbody></table>`;
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
        .map((cell) => {
          const cls = typeof cell === 'number' ? ' class="rs-cell-num"' : '';
          return `<td${cls}>${esc(cell)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const cap = caption ? `<caption>${esc(caption)}</caption>` : '';
  return `<table class="rs-table">${cap}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderFindings(items: readonly Finding[], sourceIds: ReadonlySet<string>): string {
  const summaryRows = SEVERITIES.map((sev) => {
    const count = items.filter((f) => f.severity === sev).length;
    return `<tr><td><span class="rs-chip rs-sev-${sev}">${sev}</span></td><td class="rs-cell-num">${count}</td></tr>`;
  }).join('');
  const summary =
    `<table class="rs-table rs-findings-summary"><thead><tr><th>Severity</th><th class="rs-cell-num">Count</th></tr></thead>` +
    `<tbody>${summaryRows}</tbody></table>`;
  const cards = items.map((f) => renderFinding(f, sourceIds)).join('');
  return `${summary}${cards}`;
}

function renderFinding(f: Finding, sourceIds: ReadonlySet<string>): string {
  const ref = f.ref ? `<span class="rs-ref">${esc(f.ref)}</span>` : '';
  const status = f.status ? `<p class="rs-finding-line"><strong>Status:</strong> ${esc(f.status)}</p>` : '';
  const rec = f.recommendation
    ? `<p class="rs-finding-line"><strong>Recommendation:</strong> ${esc(f.recommendation)}</p>`
    : '';
  const cites = f.cites && f.cites.length > 0 ? `<p class="rs-finding-line">${renderCites(f.cites, sourceIds)}</p>` : '';
  return (
    `<article class="rs-finding rs-sev-${f.severity}">` +
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
  items: readonly { label: string; value: number; tone?: string }[],
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
      const shown = unit ? `${value} ${unit}` : `${value}`;
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
