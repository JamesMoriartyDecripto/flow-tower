/*
 * Renders a ReportDoc to one static HTML document: the cover, the document control, the contents, the
 * numbered sections and the sources appendix. Output is a pure function of the model (no clock, no random
 * ids), so the same document always gives the same bytes. Chrome prints it to PDF in a later step.
 */

import { renderBlock } from './blocks.ts';
import { cssString, esc } from './escape.ts';
import { REPORT_CSS } from './report.css.ts';
import { shortHash, type Classification, type ReportDoc, type Section, type Source } from './model.ts';

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
};

export function renderReport(doc: ReportDoc): string {
  const sourceIds = new Set(doc.sources.map((s) => s.id));
  const numbered = numberSections(doc.sections);
  const body = [
    renderCover(doc),
    renderControl(doc),
    renderToc(numbered),
    ...numbered.map((s) => renderSection(s, sourceIds)),
    renderSourcesAppendix(doc.sources),
  ].join('\n');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${esc(doc.title)}</title>`,
    `<style>${REPORT_CSS}\n${runningHeaderCss(doc)}</style>`,
    '</head>',
    '<body data-rs-ready="1">',
    `<main class="rs-doc">${body}</main>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** A section with its number ("1", "1.2") computed from its place in the tree. */
interface NumberedSection {
  section: Section;
  number: string;
  depth: number;
  children: NumberedSection[];
}

function numberSections(sections: readonly Section[], prefix = '', depth = 0): NumberedSection[] {
  return sections.map((section, i) => {
    const number = prefix === '' ? `${i + 1}` : `${prefix}.${i + 1}`;
    return {
      section,
      number,
      depth,
      children: numberSections(section.sections ?? [], number, depth + 1),
    };
  });
}

/*
 * The running header and the classification come from the document, so they are written as CSS margin-box
 * rules after the static sheet (the title and the label are escaped as CSS strings, not HTML). The static
 * sheet's named page `rs-cover` has no margin boxes, so the cover carries no header.
 */
function runningHeaderCss(doc: ReportDoc): string {
  const label = CLASSIFICATION_LABEL[doc.classification];
  return `@page { @top-left { content: ${cssString(doc.title)}; } @top-right { content: ${cssString(label)}; } }`;
}

function renderCover(doc: ReportDoc): string {
  const brand = doc.brand ? `<p class="rs-kicker">${esc(doc.brand)}</p>` : '';
  const subtitle = doc.subtitle ? `<p class="rs-subtitle">${esc(doc.subtitle)}</p>` : '';
  const audience = doc.audience ? `<p class="rs-muted">Prepared for ${esc(doc.audience)}</p>` : '';
  return (
    `<section class="rs-cover" id="cover">` +
    `<div class="rs-band">${brand}<p class="rs-kicker">${esc(doc.type)}</p>` +
    `<h1>${esc(doc.title)}</h1>${subtitle}</div>` +
    `${audience}` +
    `<p><span class="rs-chip rs-classification">${CLASSIFICATION_LABEL[doc.classification]}</span></p>` +
    `</section>`
  );
}

/** The document control: what the document is, what it was made from, and by what. No date, by design. */
function renderControl(doc: ReportDoc): string {
  // Every value is escaped here, once, so the cells below hold ready HTML only.
  const sources = doc.sources.length
    ? doc.sources.map((s) => `${esc(s.id)} ${esc(s.label)}${shortHashSuffix(s)}`).join('<br>')
    : 'none';
  const rows: [string, string][] = [
    ['Type', esc(doc.type)],
    ['Sources', sources],
    ['Generator', esc('flow-tower report')],
    ['Classification', esc(CLASSIFICATION_LABEL[doc.classification])],
  ];
  const body = rows.map(([label, cell]) => `<tr><th>${esc(label)}</th><td>${cell}</td></tr>`).join('');
  return (
    `<section class="rs-control" id="control"><h2>Document control</h2>` +
    `<table class="rs-table rs-frame"><tbody>${body}</tbody></table></section>`
  );
}

function shortHashSuffix(s: Source): string {
  const hash = shortHash(s.sha256);
  return hash ? ` <code class="rs-hash">${esc(hash)}</code>` : '';
}

function renderToc(sections: readonly NumberedSection[]): string {
  return `<nav class="rs-toc" id="contents"><h2>Contents</h2><ol>${tocItems(sections)}</ol></nav>`;
}

function tocItems(sections: readonly NumberedSection[]): string {
  return sections
    .map((n) => {
      const id = esc(n.section.id);
      const item = `<li class="rs-toc-d${n.depth}"><span class="rs-num">${n.number}</span> <a href="#${id}">${esc(n.section.title)}</a></li>`;
      const nested = n.children.length > 0 ? `<ol>${tocItems(n.children)}</ol>` : '';
      return item + nested;
    })
    .join('');
}

function renderSection(n: NumberedSection, sourceIds: ReadonlySet<string>): string {
  // Headings step down with depth, capped at h4, so deep trees stay valid and readable.
  const level = Math.min(n.depth + 2, 4);
  const blocks = n.section.blocks.map((b) => renderBlock(b, sourceIds)).join('\n');
  const children = n.children.map((c) => renderSection(c, sourceIds)).join('\n');
  return (
    `<section class="rs-section" id="${esc(n.section.id)}">` +
    `<h${level}><span class="rs-num">${n.number}</span> ${esc(n.section.title)}</h${level}>` +
    `${blocks}${children}</section>`
  );
}

function renderSourcesAppendix(sources: readonly Source[]): string {
  if (sources.length === 0) {
    return `<section class="rs-appendix" id="sources"><h2>Sources</h2><p class="rs-muted">No sources.</p></section>`;
  }
  const rows = sources
    .map((s) => {
      const where = s.path ? esc(s.path) : s.url ? esc(s.url) : '';
      const hash = shortHash(s.sha256);
      return (
        `<tr id="src-${esc(s.id)}"><th>${esc(s.id)}</th><td>${esc(s.label)}</td>` +
        `<td>${where}</td><td>${hash ? `<code class="rs-hash">${esc(hash)}</code>` : ''}</td></tr>`
      );
    })
    .join('');
  return (
    `<section class="rs-appendix" id="sources"><h2>Sources</h2>` +
    `<table class="rs-table"><thead><tr><th>Id</th><th>Label</th><th>Location</th><th>SHA-256</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></section>`
  );
}
