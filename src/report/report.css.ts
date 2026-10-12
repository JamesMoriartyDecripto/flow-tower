/*
 * The report's static print sheet, as a string so the Node engine needs no CSS loader. Every class is prefixed
 * `rs-`: a bare name once styled both a page-breaking section and a table cell (#176), so none is left bare.
 * Colours follow the tower PDF (white paper, ink text, one accent for headings and rules).
 */

export const REPORT_CSS = `
@page {
  size: A4;
  margin: 26mm 14mm 18mm;
  @top-left { font: 800 9pt "Orbitron", sans-serif; letter-spacing: .16em; color: #111827; vertical-align: bottom; padding-bottom: 3mm; border-bottom: .3mm solid #c2410c; }
  @top-right { font: 600 7pt "Segoe UI", system-ui, sans-serif; letter-spacing: .12em; color: #4b5563; vertical-align: bottom; padding-bottom: 3mm; border-bottom: .3mm solid #c2410c; }
  /* One scheme for the whole document: the page counter is never reset, so the cover's neighbours count on. */
  @bottom-right { content: counter(page) " / " counter(pages); font: 8.5pt monospace; color: #4b5563; }
}
/* The cover is a named page: it has no margin boxes, so it carries no running header and no page number. */
@page rs-cover { margin: 0; @top-left { content: none; } @top-right { content: none; } @bottom-right { content: none; } }

html, body { background: #ffffff; color: #111827; margin: 0; }
body { font: 10pt/1.5 "Rajdhani", "Segoe UI", system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rs-doc { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }
@media print { .rs-doc { max-width: none; padding: 0; margin: 0; } }

h2, h3, h4 { font-family: "Rajdhani", "Segoe UI", system-ui, sans-serif; color: #c2410c; line-height: 1.25; margin: 0.9em 0 0.4em; }
h2 { font-size: 20pt; font-weight: 700; border-bottom: 1.5px solid #c2410c; padding-bottom: 2px; }
h3 { font-size: 14pt; font-weight: 700; }
h4 { font-size: 11pt; font-weight: 700; color: #111827; margin: 0; }
p { margin: 6px 0; overflow-wrap: break-word; }
a { color: #c2410c; text-decoration: none; }
code { font-family: monospace; font-size: 0.9em; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 2px; padding: 0 3px; }
ol, ul { padding-left: 18px; }

.rs-muted { color: #4b5563; }
.rs-kicker { font: 600 10pt "Rajdhani", sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #c2410c; margin: 0; }
.rs-subtitle { font-size: 13pt; color: #4b5563; margin: 6px 0 0; }
.rs-hash { font-size: 8pt; }

/*
 * Cover: a full page of its own. The named page has no margin, so the cover pads itself (20mm); the navy band
 * holds the title, the facts sit under it, and the brand is pinned to the foot of the page.
 */
.rs-cover { break-after: page; page: rs-cover; box-sizing: border-box; min-height: 297mm; padding: 20mm; display: flex; flex-direction: column; }
.rs-band { background: #0a1f3f; color: #e8f1ff; padding: 28px 32px 24px; display: flex; flex-direction: column; justify-content: flex-end; }
.rs-band .rs-kicker { color: #ff8a1f; }
.rs-band h1 { color: #ffffff; font-family: "Orbitron", sans-serif; font-size: 26pt; letter-spacing: .04em; margin: 8px 0 4px; overflow-wrap: break-word; }
.rs-band .rs-subtitle { color: #cbd5e1; }
.rs-cover-facts { margin-top: 24px; }
.rs-cover-facts td, .rs-cover-facts th { padding: 6px 8px; }
.rs-cover-brand { margin-top: auto; font: 800 12pt "Orbitron", sans-serif; letter-spacing: .16em; color: #0a1f3f; text-transform: uppercase; }

/* Document control: a framed label | value table, no date. It shares its page with the contents. */
.rs-control { margin-bottom: 18px; }
.rs-frame { border: 1.5px solid #c2410c; }
.rs-frame th { width: 30%; color: #4b5563; font-weight: 600; text-align: left; }

/* Tables: header repeats on each page; rows never split. */
.rs-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 8px 0 14px; table-layout: auto; }
.rs-table caption { caption-side: top; text-align: left; font: 600 10pt "Rajdhani", sans-serif; color: #111827; padding-bottom: 4px; }
.rs-table thead { display: table-header-group; }
.rs-table th { text-align: left; color: #c2410c; border-bottom: 1.5px solid #c2410c; padding: 4px 6px; }
.rs-table td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: top; overflow-wrap: break-word; }
.rs-table tr { break-inside: avoid; }
.rs-table tbody tr:nth-child(even) td { background: #f8fafc; }
.rs-facts th { width: 30%; color: #4b5563; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
.rs-facts td { border-bottom: 1px solid #e5e7eb; }
.rs-cell-num { text-align: right; font-variant-numeric: tabular-nums; }
/* Ids, dates, times and numbers stay on one line; a narrow column wraps the words, never the value. */
.rs-nowrap { white-space: nowrap; }
.rs-findings-summary { width: auto; min-width: 40%; }

/* Contents: numbers and anchors; a nested section is indented one step. */
.rs-toc { break-after: page; }
.rs-toc ol { list-style: none; padding: 0; margin: 0; }
.rs-toc li { border-bottom: 1px dotted #e5e7eb; padding: 3px 0; break-inside: avoid; }
.rs-toc li.rs-toc-d1 { padding-left: 14pt; }
.rs-toc li.rs-toc-d2 { padding-left: 28pt; }
.rs-toc li.rs-toc-d3 { padding-left: 42pt; }
.rs-num { color: #c2410c; font-variant-numeric: tabular-nums; margin-right: 4px; }

/* Sections: each top-level section starts a page. Nested ones flow on. */
.rs-section { break-before: auto; }
.rs-section > h2 { break-before: page; }
.rs-section > h2:first-child { break-before: auto; }
.rs-section > .rs-section > h3, .rs-section > .rs-section > h4 { break-after: avoid; }

/* Chips: small coloured labels; the word carries the meaning in greyscale too. */
.rs-chip { display: inline-block; font: 600 7.5pt "Rajdhani", sans-serif; letter-spacing: .03em; border-radius: 3px; padding: 0 5px; line-height: 1.5; border: 1px solid transparent; background: #e5e7eb; color: #374151; }
.rs-classification { background: #ffffff; color: #c2410c; border-color: #c2410c; font-size: 9pt; }
.rs-sev-critical { --sev: #7f1d1d; --sev-bg: #fee2e2; }
.rs-sev-high { --sev: #9a3412; --sev-bg: #ffedd5; }
.rs-sev-medium { --sev: #92400e; --sev-bg: #fef3c7; }
.rs-sev-low { --sev: #1e40af; --sev-bg: #dbeafe; }
.rs-sev-info { --sev: #374151; --sev-bg: #f1f5f9; }
.rs-chip.rs-sev-critical, .rs-chip.rs-sev-high, .rs-chip.rs-sev-medium, .rs-chip.rs-sev-low, .rs-chip.rs-sev-info { background: var(--sev-bg); color: var(--sev); border-color: var(--sev); }
.rs-rag-red { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
.rs-rag-amber { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.rs-rag-green { background: #dcfce7; color: #166534; border-color: #86efac; }

/* Findings: one card each, kept whole on a page, with the severity colour as the left rule. */
.rs-finding { break-inside: avoid; border: 1px solid #e5e7eb; border-left: 3px solid var(--sev, #9ca3af); border-radius: 2px; padding: 8px 10px; margin: 10px 0; }
.rs-finding-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rs-finding-head h4 { flex: 1 1 100%; margin-top: 2px; }
.rs-fid, .rs-ref { font-family: monospace; font-size: 8.5pt; color: #4b5563; }
.rs-finding-line { font-size: 9.5pt; margin: 4px 0 0; }
/* A closed finding is muted: grey rule and border, lighter text, so the open findings read first. */
.rs-finding-closed { border-color: #d1d5db; border-left-color: #9ca3af; color: #6b7280; }
.rs-finding-closed h4 { color: #6b7280; }
.rs-finding-count { font-weight: 600; margin: 10px 0 0; }

/* Draft text: a small badge says the prose was drafted, and its citations are links to the appendix. */
.rs-badge { display: inline-block; font: 600 7pt "Rajdhani", sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #4b5563; border: 1px solid #9ca3af; border-radius: 2px; padding: 0 4px; margin-right: 6px; vertical-align: middle; }
.rs-cite { font-size: 8.5pt; }

/* Bars: one inline SVG; its text scales with the page width. */
.rs-bars { margin: 10px 0; break-inside: avoid; }
.rs-bars figcaption { font: 700 8.5pt "Rajdhani", sans-serif; color: #c2410c; margin-bottom: 4px; }
.rs-bars svg { display: block; max-width: 100%; height: auto; font-family: "Rajdhani", sans-serif; fill: #111827; }

.rs-list { margin: 6px 0; }
.rs-list li { margin-bottom: 2px; overflow-wrap: break-word; }

.rs-appendix { break-before: page; }
.rs-appendix td { font-size: 8.5pt; }
`;
