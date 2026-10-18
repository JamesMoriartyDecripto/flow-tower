import { describe, expect, it } from 'vitest';
import { auditTower, type Finding } from '../src/core/audit';
import { upstreamGate } from '../src/core/audit-graph';
import { buildTower } from '../src/core/loader';
import { TowerSchema, type TowerDef } from '../src/core/schema';
import type { ResolvedTower } from '../src/core/types';

const none = { read: async () => undefined };

/** Builds a resolved tower from a plain definition, the same way the loader does. */
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

const aud03 = (fs: Finding[]) => fs.filter((f) => f.rule === 'AUD03');

describe('AUD03 reads what a step changes', () => {
  it('user credentials alone warn on a tool, but a read tool is lifted', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'tool', credentials: 'user' }] });
    expect(aud03(auditTower(bad))).toHaveLength(1);
    const read = await build({ nodes: [{ id: 'a', type: 'tool', credentials: 'user', effect: 'read' }] });
    expect(aud03(auditTower(read))).toEqual([]);
    const reversible = await build({ nodes: [{ id: 'a', type: 'tool', credentials: 'user', effect: 'reversible' }] });
    expect(aud03(auditTower(reversible))).toEqual([]);
  });

  it('exactly_once is never lifted by effect', async () => {
    const t = await build({ nodes: [{ id: 'pub', type: 'process', exactly_once: true, effect: 'read' }] });
    expect(aud03(auditTower(t))).toHaveLength(1);
  });

  it('irreversible warns, and an approval clears it', async () => {
    const bad = await build({ nodes: [{ id: 'pub', type: 'process', effect: 'irreversible' }] });
    expect(aud03(auditTower(bad))).toHaveLength(1);
    const ok = await build({ nodes: [{ id: 'pub', type: 'process', effect: 'irreversible', approval: { by: 'ops' } }] });
    expect(aud03(auditTower(ok))).toEqual([]);
  });

  it('guard and memory are exempt from the data trigger, a tool is not', async () => {
    const guard = await build({ nodes: [{ id: 'g', type: 'guard', data: { sensitivity: 'secret' } }] });
    expect(aud03(auditTower(guard))).toEqual([]);
    const memory = await build({ nodes: [{ id: 'm', type: 'memory', data: { sensitivity: 'secret' } }] });
    expect(aud03(auditTower(memory))).toEqual([]);
    const tool = await build({ nodes: [{ id: 't', type: 'tool', data: { sensitivity: 'secret' } }] });
    expect(aud03(auditTower(tool))).toHaveLength(1);
  });

  it('a human two plumbing nodes upstream is still a gate', async () => {
    const t = await build({
      nodes: [
        { id: 'h', type: 'human' },
        { id: 'pack', type: 'process' },
        { id: 'sched', type: 'process' },
        { id: 'pub', type: 'process', exactly_once: true },
      ],
      edges: ['h -> pack', 'pack -> sched', 'sched -> pub'],
    });
    expect(aud03(auditTower(t).filter((f) => f.node === 'l.pub'))).toEqual([]);
  });

  it('an agent between the human and the step breaks the chain', async () => {
    const t = await build({
      nodes: [
        { id: 'h', type: 'human' },
        { id: 'a', type: 'agent', model: 'm' },
        { id: 'pub', type: 'process', exactly_once: true },
      ],
      edges: ['h -> a', 'a -> pub'],
    });
    expect(aud03(auditTower(t))).toHaveLength(1);
  });

  it('a guard upstream gives an info finding naming the guard', async () => {
    const t = await build({
      nodes: [
        { id: 'g', type: 'guard' },
        { id: 'pub', type: 'process', exactly_once: true },
      ],
      edges: ['g -> pub'],
    });
    const fs = aud03(auditTower(t));
    expect(fs).toHaveLength(1);
    expect(fs[0].level).toBe('info');
    expect(fs[0].message).toContain('l.g');
  });

  it('a return edge from a human is not a gate', async () => {
    const t = await build({
      nodes: [
        { id: 'h', type: 'human' },
        { id: 'pub', type: 'process', exactly_once: true },
      ],
      edges: ['h -> pub [return]'],
    });
    const fs = aud03(auditTower(t));
    expect(fs).toHaveLength(1);
    expect(fs[0].level).toBe('warning');
  });

  it('upstreamGate finds the human three steps back', async () => {
    const t = await build({
      nodes: [
        { id: 'h', type: 'human' },
        { id: 'pack', type: 'process' },
        { id: 'sched', type: 'process' },
        { id: 'pub', type: 'process', exactly_once: true },
      ],
      edges: ['h -> pack', 'pack -> sched', 'sched -> pub'],
    });
    const nodes = t.layers.flatMap((l) => l.nodes);
    const edges = t.layers.flatMap((l) => l.edges);
    expect(upstreamGate(nodes, edges, 'l.pub')).toEqual({ kind: 'human', node: 'l.h' });
  });
});
