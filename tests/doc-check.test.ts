import { describe, expect, it } from 'vitest';
import { checkDocument, failedChecks, type DomFacts, type WorkspaceFacts } from '../src/core/doc-check';

const TOWER = 'demo/demo.tower.yaml';

/** A page where every check passes: the fixture the failing cases change one thing of. */
function goodDom(over: Partial<DomFacts> = {}): DomFacts {
  return {
    docError: undefined,
    buildingText: false,
    mainText: 'Intake Review FLOW//TOWER',
    layerTitles: ['Intake', 'Review'],
    nodeLabels: ['Triage', 'Reviewer'],
    hrefs: ['#layer-demo-intake'],
    ids: ['layer-demo-intake'],
    control: { layers: 2, nodes: 2, subTowers: 0 },
    ...over,
  };
}

function goodWs(over: Partial<WorkspaceFacts> = {}): WorkspaceFacts {
  return {
    towerId: TOWER,
    chapters: [{ towerId: TOWER, layerTitles: ['Intake', 'Review'], nodeLabels: ['Triage', 'Reviewer'] }],
    counts: { layers: 2, nodes: 2, subTowers: 0 },
    pdfPages: 3,
    ...over,
  };
}

/** The result of one named check, so a test reads the check it is about. */
const pick = (results: ReturnType<typeof checkDocument>, name: string) => {
  const r = results.find((x) => x.name === name);
  if (!r) throw new Error(`no check named ${name}`);
  return r;
};

describe('checkDocument', () => {
  it('passes every check on a complete, consistent document', () => {
    const results = checkDocument(goodDom(), goodWs());
    expect(results).toHaveLength(7);
    expect(failedChecks(results)).toEqual([]);
  });

  it('a: fails when the page reports an error or still shows the placeholder', () => {
    const err = pick(checkDocument(goodDom({ docError: 'boom' }), goodWs()), 'document rendered');
    expect(err.ok).toBe(false);
    expect(err.detail).toContain('boom');
    const building = pick(checkDocument(goodDom({ buildingText: true }), goodWs()), 'document rendered');
    expect(building.ok).toBe(false);
    expect(building.detail).toContain('Building the document');
  });

  it('b: fails and names a layer title or node label that is not on the page', () => {
    const layer = pick(checkDocument(goodDom({ layerTitles: ['Intake'] }), goodWs()), 'every layer title shown');
    expect(layer.ok).toBe(false);
    expect(layer.detail).toContain('"Review"');
    const node = pick(checkDocument(goodDom({ nodeLabels: ['Triage'] }), goodWs()), 'every node label shown');
    expect(node.ok).toBe(false);
    expect(node.detail).toContain('"Reviewer"');
  });

  it('b: lists at most five missing items, then says how many more', () => {
    const many = Array.from({ length: 8 }, (_, i) => `Node ${i}`);
    const r = pick(checkDocument(goodDom({ nodeLabels: [] }), goodWs({ chapters: [{ towerId: TOWER, layerTitles: [], nodeLabels: many }] })), 'every node label shown');
    expect(r.detail).toContain('8 missing');
    expect(r.detail).toContain('and 3 more');
  });

  it('c: fails when a control count differs from the workspace', () => {
    const r = pick(checkDocument(goodDom({ control: { layers: 2, nodes: 1, subTowers: 0 } }), goodWs()), 'control counts match the workspace');
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('nodes: page 1, workspace 2');
  });

  it('d: fails on an in-page link with no target, and on raw JSON in the text', () => {
    const dead = pick(checkDocument(goodDom({ hrefs: ['#node-missing'] }), goodWs()), 'every in-page link has a target');
    expect(dead.ok).toBe(false);
    expect(dead.detail).toContain('#node-missing');
    const json = pick(checkDocument(goodDom({ mainText: 'value {"a":1}' }), goodWs()), 'no raw JSON in the text');
    expect(json.ok).toBe(false);
  });

  it('d: a percent-encoded link resolves to its id, and a broken encoding does not throw', () => {
    const ok = checkDocument(goodDom({ hrefs: ['#layer%2Ddemo-intake'], ids: ['layer-demo-intake'] }), goodWs());
    expect(pick(ok, 'every in-page link has a target').ok).toBe(true);
    const bad = checkDocument(goodDom({ hrefs: ['#%E0%A4%A'] }), goodWs());
    expect(pick(bad, 'every in-page link has a target').ok).toBe(false);
  });

  it('e: fails when no PDF was written, or it has fewer pages than chapters plus layers', () => {
    const none = pick(checkDocument(goodDom(), goodWs({ pdfPages: undefined })), 'PDF has a page per chapter and layer');
    expect(none.ok).toBe(false);
    expect(none.detail).toBe('no PDF was written');
    // 1 chapter + 2 layers = 3 pages needed; 2 is short.
    const short = pick(checkDocument(goodDom(), goodWs({ pdfPages: 2 })), 'PDF has a page per chapter and layer');
    expect(short.ok).toBe(false);
    expect(short.detail).toBe('2 pages, need at least 3');
    const exact = pick(checkDocument(goodDom(), goodWs({ pdfPages: 3 })), 'PDF has a page per chapter and layer');
    expect(exact.ok).toBe(true);
  });

  it('reports every failure at once, not just the first', () => {
    const failed = failedChecks(checkDocument(goodDom({ docError: 'x', control: { layers: 0, nodes: 2, subTowers: 0 } }), goodWs({ pdfPages: 1 })));
    expect(failed.map((f) => f.name)).toEqual(['document rendered', 'control counts match the workspace', 'PDF has a page per chapter and layer']);
  });
});
