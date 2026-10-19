import { describe, expect, it } from 'vitest';
import { opsRows } from '../src/app/ops';
import { buildTower } from '../src/core/loader';
import { TowerSchema, type TowerDef } from '../src/core/schema';
import type { ResolvedTower } from '../src/core/types';

const none = { read: async () => undefined };

/** Builds a resolved tower from a plain definition, the same way the loader does (copied from audit.test.ts). */
async function build(def: Partial<TowerDef> & { nodes: Record<string, unknown>[]; edges?: string[]; links?: string[] }): Promise<ResolvedTower> {
  const { nodes, edges = [], links = [], ...rest } = def;
  const parsed = TowerSchema.parse({
    name: 'T',
    ...rest,
    layers: [{ id: 'l', title: 'L', nodes, edges }],
    links,
  });
  return buildTower(parsed, 't', none, []);
}

describe('schema: effect, model_varies, sandbox.description', () => {
  it('accepts the new facts and rejects an unknown effect', () => {
    const node = { id: 'a', type: 'agent', effect: 'read', model_varies: 'benchmark candidate', sandbox: { network: 'none', filesystem: 'workspace', description: 'container' } };
    expect(() => TowerSchema.parse({ name: 'T', layers: [{ id: 'l', title: 'L', nodes: [node] }] })).not.toThrow();
    const bad = { ...node, effect: 'maybe' };
    expect(() => TowerSchema.parse({ name: 'T', layers: [{ id: 'l', title: 'L', nodes: [bad] }] })).toThrow();
  });

  it('a node inherits effect from its agent; its own model_varies lands in ops', async () => {
    const t = await build({
      agents: { coder: { model: 'm', effect: 'reversible' } },
      nodes: [{ id: 'a', type: 'agent', agent: 'coder' }, { id: 'b', type: 'agent', model_varies: 'verifier from another family' }],
    });
    const nodes = t.layers[0].nodes;
    expect(nodes.find((n) => n.id === 'a')?.ops.effect).toBe('reversible');
    expect(nodes.find((n) => n.id === 'b')?.ops.model_varies).toBe('verifier from another family');
  });

  it('opsRows shows effect, model varies and the sandbox description', () => {
    const rows = opsRows({ effect: 'read', model_varies: 'x', sandbox: { network: 'none', description: 'bwrap' } });
    expect(rows.effect).toBe('read');
    expect(rows['model varies']).toBe('x');
    expect(rows.sandbox).toContain('bwrap');
  });
});
