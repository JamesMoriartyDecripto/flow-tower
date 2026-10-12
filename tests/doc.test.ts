import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { anchor, towerDoc, type Chapter, type TowerDoc } from '../src/core/doc';
import { formatValue, type FieldValue } from '../src/core/docFields';
import type { Workspace } from '../src/core/types';

/** The printable strings of a formatted value, so a test can look for any leaf in them. */
function printed(v: FieldValue): string {
  if ('text' in v) return [v.text, v.note].filter(Boolean).join(' ');
  if ('entries' in v) return v.entries.map((e) => printed(e)).join(' ');
  if ('list' in v) return v.list.join(' ');
  return v.pairs.map(([k, x]) => `${k} ${x}`).join(' ');
}

/** Every leaf value of an object (strings, numbers, booleans) as text: what must reach the page. */
function leaves(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(leaves);
  if (v !== null && typeof v === 'object') return Object.values(v).flatMap(leaves);
  return [String(v)];
}

const load = async (): Promise<Workspace> => (await loadLibrary(['examples/dev-squad'])).workspace;

/** Every anchor the document defines: chapters, layers and node details. */
function anchorsOf(doc: TowerDoc): Set<string> {
  const out = new Set<string>();
  for (const c of doc.chapters) {
    out.add(c.id);
    for (const l of c.layers) {
      out.add(l.id);
      for (const d of l.details ?? []) out.add(d.id);
    }
  }
  return out;
}

/** Every anchor the document refers to: node rows, edges, link rows, sub-towers and the TOC. */
function referencedAnchors(doc: TowerDoc): string[] {
  const out: string[] = [];
  for (const e of doc.toc) if (e.anchor) out.push(e.anchor);
  for (const c of doc.chapters) {
    for (const l of c.links) out.push(...[l.from.anchor, l.to.anchor].filter((a): a is string => !!a));
    for (const l of c.layers) {
      for (const n of l.nodes) if (n.anchor) out.push(n.anchor);
      for (const d of l.details ?? []) {
        for (const e of [...d.incoming, ...d.outgoing]) if (e.other.anchor) out.push(e.other.anchor);
        if (d.subTower?.anchor) out.push(d.subTower.anchor);
      }
    }
  }
  return out;
}

const chapterCount = (doc: TowerDoc) => doc.chapters.length;

describe('formatValue', () => {
  it('reads a budget as a sentence with its description on its own line', () => {
    const v = formatValue('budget', { usd: 0.05, per: 'run', on_exceed: 'stop', description: 'Cap per run.' });
    expect(v).toEqual({ text: '$0.05 per run · on exceed: stop', note: 'Cap per run.' });
  });

  it('keeps the description out of the summary line, for every budget in a list', () => {
    const v = formatValue('budget', [
      { usd: 2, per: 'run', description: 'Whole run.' },
      { usd: 1, per: 'day' },
    ]);
    expect(v).toEqual({
      entries: [{ text: '$2 per run', note: 'Whole run.' }, { text: '$1 per day' }],
    });
  });

  it('reads a decision as a choice of its candidates', () => {
    const v = formatValue('decision', { output: 'choice', candidates: ['quickfix', 'full', 'needs_info', 'reject'] });
    expect(v).toEqual({ text: 'choice of: quickfix · full · needs_info · reject' });
  });

  it('reads limits as pairs with humanised labels and booleans as yes or no', () => {
    const v = formatValue('limits', { concurrency: 4, timeout: '10m', maxTurns: 40, retry: false });
    expect(v).toEqual({
      pairs: [['Concurrency', '4'], ['Timeout', '10m'], ['Max turns', '40'], ['Retry', 'no']],
    });
  });

  it('flattens a nested object one level and keeps arrays as lists', () => {
    expect(formatValue('x', { inner: { a: 1, b: 'two' } })).toEqual({ pairs: [['Inner', 'a: 1 · b: two']] });
    expect(formatValue('tools', ['read', 'edit'])).toEqual({ list: ['read', 'edit'] });
  });

  it('never prints JSON', () => {
    const samples: [string, unknown][] = [
      ['budget', { usd: 1, on_exceed: 'pause' }],
      ['limits', { timeout: '5m', retries: 2 }],
      ['decision', { output: 'binary', threshold: 7 }],
      ['data', { sensitivity: 'pii', region: 'eu', retention: { days: 30 } }],
    ];
    for (const [k, v] of samples) expect(printed(formatValue(k, v))).not.toMatch(/[{}"]/);
  });

  it('keeps every leaf of the input in the output', () => {
    const samples: [string, unknown][] = [
      ['budget', [{ usd: 2, per: 'run', for: 'model', on_exceed: 'pause' }, { amount: 150, currency: 'EUR', per: 'month', description: 'Ads.' }]],
      ['budget', { rate: '0.40 USD/s', for: 'media', description: 'Assumption: plan-dependent.' }],
      ['decision', { output: 'choice', candidates: ['a', 'b'], threshold: 7 }],
      ['limits', { timeout: '5m', retries: 2, backoff: 'exponential', ttl: '1h' }],
      ['data', { sensitivity: 'pii', region: 'eu', retention: { days: 30, after: 'expiry' } }],
    ];
    for (const [k, v] of samples) {
      const out = printed(formatValue(k, v));
      for (const leaf of leaves(v)) expect(out, `${k}: ${leaf}`).toContain(leaf);
    }
  });
});

describe('anchor', () => {
  it('builds lower-case [a-z0-9-] ids from any parts', () => {
    expect(anchor('Node', 'dev_squad.tower.yaml', 'Intake/Triage!')).toBe('node-dev-squad-tower-yaml-intake-triage');
  });
});

describe('towerDoc', () => {
  it('level 1 keeps the layers but no node rows', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 1);
    const root = doc.chapters[0];
    expect(root.layers.length).toBeGreaterThan(0);
    expect(root.layers.every((l) => l.nodes.length === 0)).toBe(true);
    expect(doc.legend).toBeUndefined();
  });

  it('level 2 lists every node of the root tower exactly once', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 2);
    const root = ws.towers['dev-squad.tower.yaml'];
    const expected = root.layers.flatMap((l) => l.nodes.map((n) => n.key));
    const rows = doc.chapters[0].layers.flatMap((l) => l.nodes.map((n) => n.key));
    expect(rows).toEqual(expected);
    expect(new Set(rows).size).toBe(rows.length);
    expect(doc.legend?.types.length).toBeGreaterThan(0);
  });

  it('level 3 has a detail for every node of every included tower and resolvable anchors', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 3);
    expect(chapterCount(doc)).toBeGreaterThan(1);
    for (const c of doc.chapters) {
      const tower = ws.towers[c.towerId];
      const details = c.layers.flatMap((l) => l.details ?? []);
      expect(details.map((d) => d.key)).toEqual(tower.layers.flatMap((l) => l.nodes.map((n) => n.key)));
    }

    const anchors = anchorsOf(doc);
    for (const a of referencedAnchors(doc)) expect(anchors.has(a), `anchor ${a}`).toBe(true);
    expect(doc.issues).toEqual(ws.towers['dev-squad.tower.yaml'].issues);
    expect(doc.sources).toEqual([...new Set(doc.sources)].sort());
  });

  it.each([
    ['dev-squad', 'dev-squad.tower.yaml'],
    ['game-studio', 'game-studio.tower.yaml'],
  ])('every referenced anchor of %s is defined at levels 1, 2 and 3', async (folder, towerId) => {
    const ws = (await loadLibrary([`examples/${folder}`])).workspace;
    for (const level of [1, 2, 3] as const) {
      const doc = towerDoc(ws, towerId, level);
      const defined = anchorsOf(doc);
      for (const a of referencedAnchors(doc)) expect(defined.has(a), `level ${level}: ${a}`).toBe(true);
    }
  });

  it('the TOC lists chapters and layers only, with the layer code and one indent per depth', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 3);
    // A layer row carries its index; a chapter heading does not and is only for nested towers (depth > 0).
    const layerRows = doc.toc.filter((e) => e.index !== undefined);
    const chapterRows = doc.toc.filter((e) => e.index === undefined);
    expect(layerRows.length).toBe(doc.chapters.reduce((n, c) => n + c.layers.length, 0));
    expect(chapterRows.length).toBe(doc.chapters.length - 1);
    expect(chapterRows.every((e) => e.depth > 0)).toBe(true);
    // The root's layers sit at depth 0; a nested tower's layers sit one step under its heading.
    expect(layerRows.filter((e) => e.depth === 0).length).toBe(doc.chapters[0].layers.length);
    expect(layerRows.every((e) => e.depth === 0 || e.depth >= 2)).toBe(true);
    // Nodes are not in the TOC: they are reached through the layer tables.
    expect(doc.toc.every((e) => !e.anchor?.startsWith('node-'))).toBe(true);
  });

  it('stops nested chapters at maxDepth and does not loop', async () => {
    const ws = await load();
    const shallow = towerDoc(ws, 'dev-squad.tower.yaml', 3, { maxDepth: 1 });
    expect(shallow.chapters.every((c) => c.depth <= 1)).toBe(true);
    const none = towerDoc(ws, 'dev-squad.tower.yaml', 3, { maxDepth: 0 });
    expect(chapterCount(none)).toBe(1);
    const ids = towerDoc(ws, 'dev-squad.tower.yaml', 3).chapters.map((c: Chapter) => c.towerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the status of every node and the formatted ops of the detail', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 3);
    const details = doc.chapters[0].layers.flatMap((l) => l.details ?? []);
    expect(details.length).toBeGreaterThan(0);
    for (const d of details) {
      expect(['active', 'planned', 'experimental', 'deprecated']).toContain(d.status);
      for (const f of d.ops) expect(f.label.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', async () => {
    const ws = await load();
    expect(towerDoc(ws, 'dev-squad.tower.yaml', 3)).toEqual(towerDoc(ws, 'dev-squad.tower.yaml', 3));
  });
});
