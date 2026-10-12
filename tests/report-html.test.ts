import { describe, expect, it } from 'vitest';
import { renderReport } from '../src/report/html.ts';
import { esc } from '../src/report/escape.ts';
import type { ReportDoc } from '../src/report/model.ts';

const doc: ReportDoc = {
  type: 'validation',
  typeTitle: 'Validation review',
  title: 'Tower review',
  subtitle: 'Q3 pass',
  audience: 'the platform team',
  classification: 'internal',
  brand: 'Flow Tower',
  sources: [{ id: 'S1', label: 'tower.json', path: 'tower.json', sha256: 'abcdef0123456789ff' }],
  sections: [
    {
      id: 'summary',
      title: 'Summary',
      blocks: [
        { kind: 'text', text: 'Two nodes checked.', origin: 'data' },
        { kind: 'text', text: 'Looks healthy.', origin: 'draft', cites: ['S1'] },
        {
          kind: 'findings',
          items: [{ id: 'F-1', severity: 'high', title: 'Missing owner', detail: 'No owner set.', cites: ['S1'] }],
        },
      ],
      sections: [{ id: 'detail', title: 'Detail', blocks: [{ kind: 'list', items: ['one', 'two'] }] }],
    },
    {
      id: 'scores',
      title: 'Scores',
      blocks: [
        { kind: 'facts', rows: [['Nodes', 12]] },
        { kind: 'bars', caption: 'Load', unit: 'ms', items: [{ label: 'api', value: 40, tone: 'red' }] },
        { kind: 'status', items: [{ label: 'Build', rag: 'green' }] },
        { kind: 'table', columns: ['Name', 'Count'], rows: [['a', 1]], caption: 'Totals' },
      ],
    },
  ],
};

const CLASS_RE = /class="([^"]*)"/g;

describe('renderReport', () => {
  it('renders a small document with its title, sections and sources', () => {
    const html = renderReport(doc);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<body data-rs-ready="1">');
    expect(html).toContain('<h1>Tower review</h1>');
    expect(html).toContain('Missing owner');
    expect(html).toContain('id="src-S1"');
    expect(html).toContain('flow-tower report');
    expect(html).not.toMatch(/\b(20\d\d|19\d\d)-\d\d-\d\d\b/);
  });

  it('escapes text so markup stays text', () => {
    const hostile: ReportDoc = {
      ...doc,
      title: '<script>alert(1)</script>',
      sections: [{ id: 's', title: '<b>x</b>', blocks: [{ kind: 'text', text: '<script>bad()</script>', origin: 'data' }] }],
    };
    const html = renderReport(hostile);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<script>bad');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(esc(`a&<>"'`)).toBe('a&amp;&lt;&gt;&quot;&#39;');
  });

  it('shows the type title on the cover, not the id slug', () => {
    const html = renderReport(doc);
    const cover = html.slice(html.indexOf('id="cover"'), html.indexOf('id="control"'));
    expect(cover).toContain('Validation review');
    expect(cover).not.toContain('>validation<');
  });

  it('renders one sources table, filled into the appendix when the type declares one', () => {
    const withAppendix: ReportDoc = {
      ...doc,
      sections: [
        ...doc.sections,
        { id: 'appendix-sources', title: 'Appendix: sources', blocks: [] },
      ],
    };
    const html = renderReport(withAppendix);
    expect(html.match(/id="src-S1"/g)).toHaveLength(1);
    expect(html.match(/<h2>Sources<\/h2>/g) ?? []).toHaveLength(0);
    expect(html).toContain('<section class="rs-section" id="appendix-sources">');
    const appendix = html.slice(html.indexOf('id="appendix-sources"'));
    expect(appendix).toContain('id="src-S1"');
  });

  it('appends its own sources section only when the doc has no appendix', () => {
    const html = renderReport(doc);
    expect(html.match(/id="src-S1"/g)).toHaveLength(1);
    expect(html).toContain('<section class="rs-appendix" id="sources"><h2>Sources</h2>');
  });

  it('shows a severity chip in a Severity cell and a RAG chip in a Status cell', () => {
    const tabled: ReportDoc = {
      ...doc,
      sections: [
        {
          id: 'remediation',
          title: 'Remediation',
          blocks: [{ kind: 'table', columns: ['Id', 'Severity', 'Status'], rows: [['F-1', 'high', 'amber']] }],
        },
      ],
    };
    const html = renderReport(tabled);
    expect(html).toContain('<span class="rs-chip rs-sev-high">high</span>');
    expect(html).toContain('<span class="rs-chip rs-rag-amber">amber</span>');
  });

  it('mutes a fixed finding and keeps an open one plain', () => {
    const mixed: ReportDoc = {
      ...doc,
      sections: [
        {
          id: 'findings',
          title: 'Findings',
          blocks: [
            {
              kind: 'findings',
              items: [
                { id: 'F-1', severity: 'high', title: 'Done', detail: 'd', status: 'fixed' },
                { id: 'F-2', severity: 'low', title: 'Open', detail: 'd', status: 'open' },
              ],
            },
          ],
        },
      ],
    };
    const html = renderReport(mixed);
    expect(html).toContain('<article class="rs-finding rs-sev-high rs-finding-closed">');
    expect(html).toContain('<article class="rs-finding rs-sev-low">');
    expect(html).toContain('2 findings: 1 high, 1 low');
  });

  it('numbers sections 1, 1.1 and 2', () => {
    const html = renderReport(doc);
    expect(html).toContain('<span class="rs-num">1</span> Summary');
    expect(html).toContain('<span class="rs-num">1.1</span> Detail');
    expect(html).toContain('<span class="rs-num">2</span> Scores');
  });

  it('links every table of contents entry to a section id', () => {
    const html = renderReport(doc);
    const toc = html.slice(html.indexOf('id="contents"'), html.indexOf('</nav>'));
    const links = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(['summary', 'detail', 'scores']);
    for (const id of links) expect(html).toContain(`<section class="rs-section" id="${id}">`);
  });

  it('prefixes every class with rs-', () => {
    const html = renderReport(doc);
    const classes = [...html.matchAll(CLASS_RE)].flatMap((m) => m[1].split(/\s+/));
    expect(classes.length).toBeGreaterThan(0);
    for (const c of classes) expect(c.startsWith('rs-')).toBe(true);
  });

  it('marks drafts and links their citations', () => {
    const html = renderReport(doc);
    expect(html).toContain('<span class="rs-badge">drafted</span>');
    expect(html).toContain('<a class="rs-cite" href="#src-S1">[S1]</a>');
  });

  it('rejects a draft without citations and a citation of an unknown source', () => {
    const noCite: ReportDoc = {
      ...doc,
      sections: [{ id: 'x', title: 'X', blocks: [{ kind: 'text', text: 'hi', origin: 'draft' }] }],
    };
    expect(() => renderReport(noCite)).toThrow(/cite/);
    const unknown: ReportDoc = {
      ...doc,
      sections: [{ id: 'x', title: 'X', blocks: [{ kind: 'text', text: 'hi', origin: 'draft', cites: ['S9'] }] }],
    };
    expect(() => renderReport(unknown)).toThrow(/unknown source/);
  });

  it('keeps ids, dates, times and numbers on one line, and leaves words to wrap', () => {
    const cells: ReportDoc = {
      ...doc,
      sections: [
        {
          id: 'cells',
          title: 'Cells',
          blocks: [
            {
              kind: 'table',
              columns: ['Id', 'Due', 'Note', 'Amount'],
              rows: [['A-01', '2026-09-17', 'a long sentence that may wrap', '18,420.50 EUR']],
            },
            { kind: 'facts', rows: [['Started', '2026-09-03 14:02 UTC'], ['Count', 12]] },
          ],
        },
      ],
    };
    const html = renderReport(cells);
    expect(html).toContain('<td class="rs-nowrap">A-01</td>');
    expect(html).toContain('<td class="rs-nowrap">2026-09-17</td>');
    expect(html).toContain('<td>a long sentence that may wrap</td>');
    expect(html).toContain('<td class="rs-nowrap">2026-09-03 14:02 UTC</td>');
    expect(html).toContain('<td class="rs-cell-num rs-nowrap">12</td>');
  });

  it('shows overall RAG as a chip in the facts row', () => {
    const facts: ReportDoc = {
      ...doc,
      sections: [{ id: 'sum', title: 'Sum', blocks: [{ kind: 'facts', rows: [['Overall', 'amber']] }] }],
    };
    expect(renderReport(facts)).toContain('<td><span class="rs-chip rs-rag-amber">amber</span></td>');
  });

  it('numbers pages from the cover on with one scheme: no reset, and no number on the cover', () => {
    const html = renderReport(doc);
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    expect(css).toContain('counter(page) " / " counter(pages)');
    expect(css).not.toMatch(/counter-reset/);
    const coverRule = css.slice(css.indexOf('@page rs-cover'), css.indexOf('\n', css.indexOf('@page rs-cover')));
    expect(coverRule).toContain('@bottom-right { content: none; }');
  });

  it('is identical on two renders', () => {
    expect(renderReport(doc)).toBe(renderReport(doc));
  });
});
