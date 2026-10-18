import { describe, expect, it } from 'vitest';
import { auditTower, type Finding } from '../src/core/audit';
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

const rulesOf = (fs: Finding[], rule: Finding['rule']) => fs.filter((f) => f.rule === rule);

describe('AUD02 fan-out width', () => {
  it('a count of 3 or a range up to 14 is within the width bound', async () => {
    expect(rulesOf(auditTower(await build({ nodes: [{ id: 'a', type: 'process', fanout: 3 }] })), 'AUD02')).toEqual([]);
    expect(rulesOf(auditTower(await build({ nodes: [{ id: 'a', type: 'process', fanout: { min: 8, max: 14 } }] })), 'AUD02')).toEqual([]);
  });

  it('a range whose max is 25 fires and names the width', async () => {
    const fs = rulesOf(auditTower(await build({ nodes: [{ id: 'a', type: 'process', fanout: { max: 25 } }] })), 'AUD02');
    expect(fs).toHaveLength(1);
    expect(fs[0].message).toContain('25');
  });

  it('a range whose max is 25 is quiet with concurrency limits', async () => {
    const t = await build({ nodes: [{ id: 'a', type: 'process', fanout: { max: 25 }, limits: { concurrency: 4 } }] });
    expect(rulesOf(auditTower(t), 'AUD02')).toEqual([]);
  });

  it('an agent with 4 spawn edges to 4 agents is 4 wide, quiet', async () => {
    const agents = ['w1', 'w2', 'w3', 'w4'].map((id) => ({ id, type: 'agent', model: 'm' }));
    const t = await build({
      nodes: [{ id: 'lead', type: 'agent', model: 'm' }, ...agents],
      edges: ['lead -> w1 [spawn]', 'lead -> w2 [spawn]', 'lead -> w3 [spawn]', 'lead -> w4 [spawn]'],
    });
    expect(rulesOf(auditTower(t), 'AUD02')).toEqual([]);
  });

  it('an agent spawning one agent with fanout max 30 is wide, fires on the lead', async () => {
    const t = await build({
      nodes: [
        { id: 'lead', type: 'agent', model: 'm' },
        { id: 'worker', type: 'agent', model: 'm', fanout: { max: 30 } },
      ],
      edges: ['lead -> worker [spawn]'],
    });
    const onLead = rulesOf(auditTower(t), 'AUD02').filter((f) => f.node === 'l.lead');
    expect(onLead).toHaveLength(1);
  });

  it('human and output nodes start lanes, so a wide fanout there is quiet', async () => {
    expect(rulesOf(auditTower(await build({ nodes: [{ id: 'h', type: 'human', fanout: 50 }] })), 'AUD02')).toEqual([]);
    expect(rulesOf(auditTower(await build({ nodes: [{ id: 'y', type: 'output', fanout: 50 }] })), 'AUD02')).toEqual([]);
  });
});

describe('AUD01 return that closes a delegation', () => {
  it('a spawn with its return back is a closed delegation, quiet', async () => {
    const t = await build({
      nodes: [{ id: 'p', type: 'agent', model: 'm' }, { id: 'h', type: 'agent', model: 'm' }],
      edges: ['p -> h [spawn]', 'h -> p [return]'],
    });
    expect(rulesOf(auditTower(t), 'AUD01')).toEqual([]);
  });

  it('a return with no spawn or call behind it is a revision loop, fires', async () => {
    // Both agents sit on the cycle, so each gets its own AUD01 finding.
    const t = await build({
      nodes: [{ id: 'p', type: 'agent', model: 'm' }, { id: 'h', type: 'agent', model: 'm' }],
      edges: ['p -> h', 'h -> p [return]'],
    });
    expect(rulesOf(auditTower(t), 'AUD01')).toHaveLength(2);
  });
});
