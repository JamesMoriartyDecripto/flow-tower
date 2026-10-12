import { describe, expect, it } from 'vitest';
import { checkReport, failed } from '../src/report/checks.ts';
import { renderReport } from '../src/report/html.ts';
import type { ReportDoc } from '../src/report/model.ts';

function doc(over: Partial<ReportDoc> = {}): ReportDoc {
  return {
    type: 'Review',
    title: 'Tower review',
    classification: 'internal',
    sources: [{ id: 'S1', label: 'Source one' }],
    sections: [
      {
        id: 'intro',
        title: 'Intro',
        blocks: [
          { kind: 'text', text: 'Data says the tower has 3 layers.', origin: 'data', cites: ['S1'] },
          { kind: 'facts', rows: [['Layers', 3]] },
        ],
      },
    ],
    ...over,
  };
}

/** The html the caller holds; a model the renderer refuses gives no html, and the checks still run. */
function htmlOf(d: ReportDoc): string {
  try {
    return renderReport(d);
  } catch {
    return '';
  }
}

function run(d: ReportDoc, required: string[] = ['intro']) {
  return checkReport(d, htmlOf(d), { sections: required });
}

function blockingIds(d: ReportDoc, required?: string[]): string[] {
  return failed(run(d, required)).map((r) => r.id);
}

describe('report checks', () => {
  it('passes a sound document', () => {
    expect(failed(run(doc()))).toEqual([]);
  });

  it('sections: fails when a required section is missing', () => {
    expect(blockingIds(doc(), ['intro', 'missing'])).toEqual(['sections']);
  });

  it('sections: finds a nested section', () => {
    const d = doc({
      sections: [{ id: 'top', title: 'Top', blocks: [], sections: [{ id: 'deep', title: 'Deep', blocks: [{ kind: 'list', items: ['a'] }] }] }],
    });
    expect(blockingIds(d, ['deep'])).toEqual([]);
  });

  it('not-empty: fails on a section with no blocks and no subsections', () => {
    const d = doc({ sections: [{ id: 'intro', title: 'Intro', blocks: [] }] });
    expect(blockingIds(d)).toEqual(['not-empty']);
  });

  it('finding-ids: fails on duplicate ids', () => {
    const f = { id: 'F1', severity: 'low' as const, title: 't', detail: 'd' };
    const d = doc({
      sections: [{ id: 'intro', title: 'Intro', blocks: [{ kind: 'findings', items: [f, { ...f }] }] }],
    });
    expect(blockingIds(d)).toEqual(['finding-ids']);
  });

  it('finding-ids: fails on an empty id', () => {
    const d = doc({
      sections: [{ id: 'intro', title: 'Intro', blocks: [{ kind: 'findings', items: [{ id: ' ', severity: 'low', title: 't', detail: 'd' }] }] }],
    });
    expect(blockingIds(d)).toEqual(['finding-ids']);
  });

  it('cites: fails on a cite that is not a source', () => {
    const d = doc({
      sections: [{ id: 'intro', title: 'Intro', blocks: [{ kind: 'text', text: 'x', origin: 'data', cites: ['S9'] }] }],
    });
    // The renderer also refuses this model, so `deterministic` fails too; the cite failure must be listed.
    expect(blockingIds(d)).toContain('cites');
  });

  it('cites: fails on a draft text with no cite', () => {
    const d = doc({
      sections: [{ id: 'intro', title: 'Intro', blocks: [{ kind: 'text', text: 'Prose', origin: 'draft' }] }],
    });
    expect(blockingIds(d)).toContain('cites');
  });

  it('draft-numbers: fails when a draft contains a digit', () => {
    const d = doc({
      sections: [{ id: 'intro', title: 'Intro', blocks: [{ kind: 'text', text: 'About 4 layers', origin: 'draft', cites: ['S1'] }] }],
    });
    expect(blockingIds(d)).toEqual(['draft-numbers']);
  });

  it('raw-data: fails on a JSON dump in a table cell', () => {
    const d = doc({
      sections: [{ id: 'intro', title: 'Intro', blocks: [{ kind: 'table', columns: ['x'], rows: [['{"a":1}']] }] }],
    });
    expect(blockingIds(d)).toEqual(['raw-data']);
  });

  it('links: fails on an href with no target', () => {
    const d = doc();
    const html = renderReport(d).replace('</main>', '<a href="#nowhere">x</a></main>');
    const res = failed(checkReport(d, html, { sections: ['intro'] }));
    expect(res.map((r) => r.id)).toEqual(['links']);
  });

  it('sources-used: an unused source is a warning, not a block', () => {
    const d = doc({ sources: [{ id: 'S1', label: 'one' }, { id: 'S2', label: 'two' }] });
    const res = run(d);
    const warn = res.find((r) => r.id === 'sources-used');
    expect(warn).toMatchObject({ ok: true, level: 'warn' });
    expect(warn?.detail).toContain('S2');
    expect(failed(res)).toEqual([]);
  });

  it('deterministic: passes for a pure render', () => {
    const res = run(doc());
    expect(res.find((r) => r.id === 'deterministic')?.ok).toBe(true);
  });
});
