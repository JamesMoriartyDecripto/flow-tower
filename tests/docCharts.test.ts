import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import {
  CONTROLS, TOP_CONNECTED, edgesByKind, governanceCoverage, layerComposition, layerMatrix,
  modelsByLayer, runtimesByLayer, topConnected,
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
});
