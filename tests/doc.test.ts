import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { anchor, canonicalJson, classificationOf, docSummary, findingsOf, severityCounts, towerDoc, type Chapter, type TowerDoc } from '../src/core/doc';
import { includedTowers, MAX_TOWERS, printedTowers } from '../src/core/docSummary';
import { fileKey } from '../src/core/docFiles';
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

describe('docSummary', () => {
  it('counts every layer, node, agent and human checkpoint of the workspace', async () => {
    const ws = await load();
    const root = ws.towers['dev-squad.tower.yaml'];
    const s = docSummary(ws, 'dev-squad.tower.yaml', new Map([['dev-squad.tower.yaml', 0]]));
    const nodes = root.layers.flatMap((l) => l.nodes);
    expect(s.layers).toBe(root.layers.length);
    expect(s.nodes).toBe(nodes.length);
    expect(s.agents).toBe(nodes.filter((n) => n.agent).length);
    expect(s.humans).toBe(nodes.filter((n) => n.type === 'human' || n.ops.approval).length);
  });

  it('splits the nodes by type and by status, each summing to the node count', async () => {
    const ws = await load();
    const s = docSummary(ws, 'dev-squad.tower.yaml', new Map([['dev-squad.tower.yaml', 0]]));
    expect(s.byType.reduce((n, t) => n + t.nodes, 0)).toBe(s.nodes);
    expect(s.byStatus.reduce((n, t) => n + t.nodes, 0)).toBe(s.nodes);
    for (const t of s.byType) expect(t.nodes).toBeGreaterThan(0);
  });

  it('lists the models in use by node count, most first, and reads a verdict from the issues', async () => {
    const ws = await load();
    const s = docSummary(ws, 'dev-squad.tower.yaml', new Map([['dev-squad.tower.yaml', 0]]));
    const counts = s.models.map((m) => m.nodes);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(s.models.every((m) => m.model.length > 0)).toBe(true);
    const issues = ws.towers['dev-squad.tower.yaml'].issues;
    const errors = issues.filter((i) => i.level === 'error').length;
    const warnings = issues.filter((i) => i.level === 'warning').length;
    const expected = errors ? 'ERRORS' : warnings ? 'WARNINGS' : 'PASS';
    expect(s.validation.verdict).toBe(expected);
    expect(s.validation.errors).toBe(errors);
    expect(s.validation.warnings).toBe(warnings);
  });

  it('counts every reachable nested tower', async () => {
    const ws = await load();
    const root = 'dev-squad.tower.yaml';
    expect(docSummary(ws, root, new Map([[root, 0]])).subTowers).toBe(0);
    expect(docSummary(ws, root, printedTowers(ws, root).depths).subTowers).toBe(towerDoc(ws, root, 3).chapters.length - 1);
  });
});

describe('classification and fingerprint inputs', () => {
  it('defaults to Internal when no node declares a sensitivity', () => {
    const ws = { towers: { t: { layers: [{ nodes: [{ ops: {}, tower: undefined }] }] } } } as unknown as Workspace;
    expect(classificationOf(ws, new Map([['t', 0]]))).toBe('Internal');
  });

  it('takes the highest sensitivity declared, in upper case', () => {
    const node = (sensitivity: string) => ({ ops: { data: { sensitivity } } });
    const ws = { towers: { t: { layers: [{ nodes: [node('public'), node('pii'), node('internal')] }] } } } as unknown as Workspace;
    expect(classificationOf(ws, new Map([['t', 0]]))).toBe('PII');
  });

  it('serialises the same object to the same text whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'x' } })).toBe(
      canonicalJson({ a: { c: 'x', d: [2, { y: 2, z: 1 }] }, b: 1 }),
    );
  });
});

describe('node refs and findings', () => {
  it('numbers every node N-Lxx.yy by its layer and its position', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 2);
    for (const l of doc.chapters[0].layers) {
      l.nodes.forEach((n, i) => {
        expect(n.ref).toBe(`N-L${String(l.index + 1).padStart(2, '0')}.${String(i + 1).padStart(2, '0')}`);
      });
    }
  });

  it('numbers findings V-01 onward, most severe first', () => {
    const f = findingsOf([
      { level: 'info', message: 'b' },
      { level: 'error', message: 'a', path: 'x' },
      { level: 'warning', message: 'c' },
    ], 'T');
    expect(f.map((x) => x.id)).toEqual(['V-01', 'V-02', 'V-03']);
    expect(f.map((x) => x.level)).toEqual(['error', 'warning', 'info']);
    expect(f[2].location).toBe('T');
  });

  it('counts the three severities, zero counts kept', () => {
    expect(severityCounts([{ level: 'error', message: 'e' }]).map((s) => s.count)).toEqual([1, 0, 0]);
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
    expect(doc.findings?.length).toBe(ws.towers['dev-squad.tower.yaml'].issues.length);
  });

  it('level 3 lists every referenced file once per tower, sorted, with the nodes that use it', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 3);
    const files = doc.files ?? [];
    expect(files.length).toBeGreaterThan(0);
    const keys = files.map((f) => fileKey(f));
    expect(new Set(keys).size).toBe(keys.length);
    const paths = files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    for (const f of files) expect(f.refs.length).toBeGreaterThan(0);
    // The triage tower file the e2e test names: its source is in the appendix with the node that uses it.
    const triage = files.find((f) => f.path === 'src/triage.ts');
    expect(triage, 'src/triage.ts is listed').toBeDefined();
    // Each ref names the node by its code (N-Lxx.yy), so a reader can find it in the layer table.
    expect(triage!.refs.every((r) => /N-L\d{2}\.\d{2}$/.test(r))).toBe(true);
  });

  it('levels 1 and 2 carry no appendix', async () => {
    const ws = await load();
    expect(towerDoc(ws, 'dev-squad.tower.yaml', 1).files).toBeUndefined();
    expect(towerDoc(ws, 'dev-squad.tower.yaml', 2).files).toBeUndefined();
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

  it('prints every reachable tower at every level, each once, and does not loop', async () => {
    const ws = await load();
    const root = 'dev-squad.tower.yaml';
    const reachable = includedTowers(ws, root).size;
    for (const level of [1, 2, 3, 4] as const) {
      const doc = level === 4 ? towerDoc(ws, root, 4) : towerDoc(ws, root, level);
      const ids = doc.chapters.map((c: Chapter) => c.towerId);
      expect(ids.length, `level ${level}: every reachable tower`).toBe(reachable);
      expect(new Set(ids).size, `level ${level}: each tower once`).toBe(ids.length);
    }
  });

  it('keeps a hard limit of towers, and says so when it is hit', () => {
    // A ring of MAX_TOWERS + 5 towers, each pointing at the next: the walk must stop at the limit.
    const n = MAX_TOWERS + 5;
    const towers: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) {
      towers[`t${i}`] = { layers: [{ id: 'l', index: 0, nodes: [{ key: 'k', tower: `t${(i + 1) % n}` }] }] };
    }
    const ws = { towers } as unknown as Workspace;
    const { depths, limited } = printedTowers(ws, 't0');
    expect(depths.size).toBe(MAX_TOWERS);
    expect(limited).toBe(true);
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
