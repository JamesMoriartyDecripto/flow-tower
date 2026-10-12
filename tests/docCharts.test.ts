import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import {
  CONTROLS, PAGE_B_FLOW_LINES, TOP_CONNECTED, edgesByKind, governanceCoverage, isWideTable, layerComposition, layerMatrix,
  modelsByLayer, pageBFlows, pageBLines, runtimesByLayer, topConnected, type ChapterCharts, type LayerTable,
} from '../src/core/docCharts';
import type { ResolvedTower, Workspace } from '../src/core/types';

const ROOT = 'dev-squad.tower.yaml';

const load = async (): Promise<Workspace> => (await loadLibrary(['examples/dev-squad'])).workspace;

const edgeCount = (t: ResolvedTower) => t.layers.reduce((n, l) => n + l.edges.length, 0) + t.links.length;

describe('docCharts', () => {
  it('the layer matrix counts every edge once, and its diagonal is the edges inside a layer', async () => {
    const t = (await load()).towers[ROOT];
    const m = layerMatrix(t);
    expect(m.codes.length).toBe(t.layers.length);
    expect(m.counts.flat().reduce((a, b) => a + b, 0)).toBe(edgeCount(t));
    t.layers.forEach((l, i) => expect(m.counts[i][i]).toBeGreaterThanOrEqual(l.edges.length));
  });

  it('the composition of each layer sums to its node count', async () => {
    const t = (await load()).towers[ROOT];
    for (const c of layerComposition(t)) {
      expect(c.byType.reduce((n, x) => n + x.nodes, 0)).toBe(c.nodes);
    }
  });

  it('edges by kind sum to the edge count, in schema order', async () => {
    const t = (await load()).towers[ROOT];
    const kinds = edgesByKind(t);
    expect(kinds.reduce((n, k) => n + k.edges, 0)).toBe(edgeCount(t));
    expect(kinds.every((k) => k.edges > 0)).toBe(true);
  });

  it('lists at most the top connected nodes, most connected first, each with at least one edge', async () => {
    const t = (await load()).towers[ROOT];
    const top = topConnected(t);
    expect(top.length).toBeLessThanOrEqual(TOP_CONNECTED);
    const degrees = top.map((r) => r.in + r.out);
    expect(degrees).toEqual([...degrees].sort((a, b) => b - a));
    expect(top.every((r) => r.in + r.out > 0)).toBe(true);
  });

  it('governance coverage counts over the governed nodes only, one row per control', async () => {
    const t = (await load()).towers[ROOT];
    const cov = governanceCoverage(t);
    expect(cov.map((c) => c.control)).toEqual([...CONTROLS]);
    const total = cov[0].total;
    for (const c of cov) {
      expect(c.total).toBe(total);
      expect(c.n).toBeLessThanOrEqual(total);
    }
  });

  it('runtime and model tables give one row per layer, and no row counts more than the layer holds', async () => {
    const t = (await load()).towers[ROOT];
    for (const table of [runtimesByLayer(t), modelsByLayer(t)]) {
      expect(table.rows.length).toBe(t.layers.length);
      table.rows.forEach((r, i) => {
        expect(r.counts.length).toBe(table.columns.length);
        expect(r.counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(t.layers[i].nodes.length);
      });
    }
  });

  it('a table of more than five columns, the label included, is full width; a narrower one is half', () => {
    const table = (n: number): LayerTable => ({ columns: Array.from({ length: n }, (_, i) => `c${i}`), rows: [] });
    expect(isWideTable(table(4))).toBe(false);
    expect(isWideTable(table(5))).toBe(true);
  });
});

/** A chapter's charts with page B's rows set by the caller; only the row counts matter to the page split. */
function chapter(over: Partial<{ edges: number; connected: number; runtimes: number; models: number; tree?: number }>): ChapterCharts {
  const kinds = Array.from({ length: over.edges ?? 0 }, (_, i) => ({ kind: 'call' as const, edges: i + 1 }));
  const rows = (n = 0) => Array.from({ length: n }, (_, i) => ({ ref: `r${i}`, key: `k${i}`, label: 'x', layer: 'L01', in: 1, out: 0 }));
  const table = (n = 0): LayerTable => ({ columns: [], rows: Array.from({ length: n }, (_, i) => ({ code: `L${i}`, title: 't', counts: [] })) });
  const tree = over.tree ? { id: 'a', title: 'a', layers: 1, nodes: 1, children: Array.from({ length: over.tree - 1 }, (_, i) => ({ id: `c${i}`, title: 'c', layers: 1, nodes: 1, children: [] })) } : undefined;
  return {
    matrix: { codes: [], counts: [] },
    composition: [],
    edges: kinds,
    connected: rows(over.connected),
    coverage: [],
    runtimes: table(over.runtimes),
    models: table(over.models),
    tree,
  };
}

describe('the page split of a chapter', () => {
  it('counts page B lines: the governance rows, edges, connected nodes, table rows and tree towers', () => {
    const c = chapter({ edges: 2, connected: 3, runtimes: 2, models: 1, tree: 3 });
    expect(pageBLines(c)).toBe(CONTROLS.length + 2 + 3 + 2 + 1 + 3);
  });

  it('a small tower flows onto page A; a large one keeps page B on its own page', () => {
    expect(pageBFlows(chapter({ edges: 1, connected: 1, runtimes: 1, models: 1 }))).toBe(true);
    expect(pageBFlows(chapter({ edges: 6, connected: 10, runtimes: 8, models: 8, tree: 6 }))).toBe(false);
    expect(PAGE_B_FLOW_LINES).toBeGreaterThan(0);
  });
});
