import { describe, expect, it } from 'vitest';
import { auditContext, NO_CONTEXT } from '../src/core/audit-context';
import { auditTower, type Finding } from '../src/core/audit';
import { buildTower } from '../src/core/loader';
import { TowerSchema, type TowerDef } from '../src/core/schema';
import type { ResolvedTower, Workspace } from '../src/core/types';

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

const rulesOf = (fs: Finding[], rule: string) => fs.filter((f) => f.rule === rule);
const agents = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, type: 'agent', model: 'm' }));

/** A workspace where each tower opens the next through a `sub` node; the last tower gets `last` nodes. */
async function chain(ids: string[], budgets: Record<string, boolean> = {}, last: Record<string, unknown>[] = [{ id: 'leaf', type: 'process' }]): Promise<Workspace> {
  const towers: Record<string, ResolvedTower> = {};
  for (let i = 0; i < ids.length; i++) {
    const sub = ids[i + 1];
    // A tower needs at least one node to parse, so the leaf keeps a plain process node.
    const nodes = sub ? [{ id: 'sub', type: 'process', tower: sub }] : last;
    const budget = budgets[ids[i]] ? { usd: 10 } : undefined;
    towers[ids[i]] = await build({ nodes, ...(budget ? { budget } : {}) });
  }
  return { projects: [ids[0]], towers, loadedAt: '' };
}

describe('AUD10 inherits the run budget from the towers above', () => {
  it('a sub-tower under a budgeted root is quiet, the same tower alone is not', async () => {
    const ws = await chain(['a', 'b'], { a: true });
    ws.towers.b = await build({ nodes: agents(3) });
    expect(rulesOf(auditTower(ws.towers.b, auditContext(ws, 'b')), 'AUD10')).toEqual([]);
    expect(rulesOf(auditTower(ws.towers.b), 'AUD10')).toHaveLength(1);
  });

  it('a second unbudgeted root that also opens it brings AUD10 back', async () => {
    const ws = await chain(['a', 'b'], { a: true });
    ws.towers.b = await build({ nodes: agents(3) });
    ws.towers.c = await build({ nodes: [{ id: 'sub', type: 'process', tower: 'b' }] });
    expect(rulesOf(auditTower(ws.towers.b, auditContext(ws, 'b')), 'AUD10')).toHaveLength(1);
  });

  it('a budget two levels up covers the third level', async () => {
    const ws = await chain(['a', 'b', 'c'], { a: true });
    ws.towers.c = await build({ nodes: agents(3) });
    expect(rulesOf(auditTower(ws.towers.c, auditContext(ws, 'c')), 'AUD10')).toEqual([]);
  });
});

describe('AUD03 inherits a human gate from the parent tower', () => {
  it('an entry opened after a human approval is quiet only with the context', async () => {
    const ws: Workspace = { projects: ['a'], loadedAt: '', towers: {} };
    ws.towers.a = await build({
      nodes: [{ id: 'h', type: 'human' }, { id: 'sub', type: 'process', tower: 'b' }],
      edges: ['h -> sub'],
    });
    ws.towers.b = await build({ nodes: [{ id: 'job', type: 'entry', exactly_once: true }] });
    expect(rulesOf(auditTower(ws.towers.b, auditContext(ws, 'b')), 'AUD03')).toEqual([]);
    expect(rulesOf(auditTower(ws.towers.b), 'AUD03')).toHaveLength(1);
  });
});

describe('auditContext', () => {
  it('a root tower gets NO_CONTEXT', async () => {
    const ws = await chain(['a', 'b'], { a: true });
    expect(auditContext(ws, 'a')).toEqual(NO_CONTEXT);
  });

  it('a cycle of tower references returns without hanging', async () => {
    const ws = await chain(['a', 'b']);
    ws.towers.b = await build({ nodes: [{ id: 'sub', type: 'process', tower: 'a' }] });
    expect(auditContext(ws, 'a')).toEqual({ runBudget: false, runLimits: false, gated: false });
    expect(auditContext(ws, 'b')).toEqual({ runBudget: false, runLimits: false, gated: false });
  });
});
