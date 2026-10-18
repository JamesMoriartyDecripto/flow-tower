import { describe, expect, it } from 'vitest';
import { auditNesting, auditTower, inventory, RULES, type Finding } from '../src/core/audit';
import { buildTower, loadLibrary } from '../src/core/loader';
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

const rulesOf = (fs: Finding[], rule: keyof typeof RULES) => fs.filter((f) => f.rule === rule);

describe('AUD01 agent loops with no budget', () => {
  it('fires on a self-loop agent with no limits', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'agent', model: 'm' }], edges: ['a -> a [handoff]'] });
    expect(rulesOf(auditTower(bad), 'AUD01')).toHaveLength(1);
  });

  it('is quiet once the node has limits', async () => {
    const t = await build({ nodes: [{ id: 'a', type: 'agent', model: 'm', limits: { max_iterations: 5 } }], edges: ['a -> a [handoff]'] });
    expect(rulesOf(auditTower(t), 'AUD01')).toEqual([]);
  });
});

describe('AUD02 fan-out with no limits', () => {
  it('fires on fanout, quiet with tower limits', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'process', fanout: 21 }] });
    expect(rulesOf(auditTower(bad), 'AUD02')).toHaveLength(1);
    const ok = await build({ limits: { timeout: '5m' }, nodes: [{ id: 'a', type: 'process', fanout: 21 }] });
    expect(rulesOf(auditTower(ok), 'AUD02')).toEqual([]);
  });
});

describe('AUD03 gated sensitive steps', () => {
  it('fires on exactly_once with no approval and no human before it', async () => {
    const bad = await build({ nodes: [{ id: 'pay', type: 'process', exactly_once: true }] });
    expect(rulesOf(auditTower(bad), 'AUD03')).toHaveLength(1);
  });

  it('is quiet with a human node upstream', async () => {
    const ok = await build({
      nodes: [{ id: 'h', type: 'human' }, { id: 'pay', type: 'process', exactly_once: true }],
      edges: ['h -> pay'],
    });
    expect(rulesOf(auditTower(ok), 'AUD03')).toEqual([]);
  });
});

describe('AUD04 decision branches', () => {
  it('fires on a decision with one outgoing edge', async () => {
    const bad = await build({
      nodes: [{ id: 'd', type: 'decision', decision: { output: 'binary', fail: 'closed' } }, { id: 'y', type: 'output' }, { id: 'x', type: 'agent', model: 'm' }],
      edges: ['d -> y'],
    });
    expect(rulesOf(auditTower(bad), 'AUD04')).toHaveLength(1);
  });

  it('is quiet with two branches and a fail mode', async () => {
    const ok = await build({
      nodes: [{ id: 'd', type: 'decision', decision: { output: 'binary', fail: 'closed' } }, { id: 'y', type: 'output' }, { id: 'n', type: 'output' }],
      edges: ['d -> y', 'd -> n'],
    });
    expect(rulesOf(auditTower(ok), 'AUD04')).toEqual([]);
  });
});

describe('AUD05 agent answers without evals', () => {
  it('fires on agent -> output with no evals', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'agent', model: 'm' }, { id: 'y', type: 'output' }], edges: ['a -> y'] });
    expect(rulesOf(auditTower(bad), 'AUD05')).toHaveLength(1);
  });

  it('is quiet with evals on the agent', async () => {
    const ok = await build({
      nodes: [{ id: 'a', type: 'agent', model: 'm', evals: [{ name: 'acc', value: 0.9 }] }, { id: 'y', type: 'output' }],
      edges: ['a -> y'],
    });
    expect(rulesOf(auditTower(ok), 'AUD05')).toEqual([]);
  });
});

describe('AUD06 too many tools', () => {
  const tools = Array.from({ length: 16 }, (_, i) => `t${i}`);

  it('fires above 15 tools', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'process', tools }] });
    expect(rulesOf(auditTower(bad), 'AUD06')).toHaveLength(1);
  });

  it('is quiet at 15', async () => {
    const ok = await build({ nodes: [{ id: 'a', type: 'process', tools: tools.slice(1) }] });
    expect(rulesOf(auditTower(ok), 'AUD06')).toEqual([]);
  });
});

describe('AUD07 dead ends', () => {
  it('fires on a process with no outgoing edge', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'process' }] });
    expect(rulesOf(auditTower(bad), 'AUD07')).toHaveLength(1);
  });

  it('is quiet when the node is the target of a call', async () => {
    const ok = await build({ nodes: [{ id: 'a', type: 'process' }, { id: 'b', type: 'process' }], edges: ['a -> b [call]'] });
    expect(rulesOf(auditTower(ok), 'AUD07')).toEqual([]);
  });
});

describe('AUD09 agent with no model', () => {
  it('fires on an agent with no model', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'agent' }] });
    expect(rulesOf(auditTower(bad), 'AUD09')).toHaveLength(1);
  });

  it('is quiet when the agent carries the model', async () => {
    const ok = await build({ agents: { x: { model: 'm' } }, nodes: [{ id: 'a', agent: 'x' }] });
    expect(rulesOf(auditTower(ok), 'AUD09')).toEqual([]);
  });
});

describe('AUD10 many agents, no run budget', () => {
  const agents = [{ id: 'a', type: 'agent', model: 'm' }, { id: 'b', type: 'agent', model: 'm' }, { id: 'c', type: 'agent', model: 'm' }];

  it('fires on 3 agents with no tower budget or limits', async () => {
    expect(rulesOf(auditTower(await build({ nodes: agents })), 'AUD10')).toHaveLength(1);
  });

  it('is quiet with a tower budget', async () => {
    const ok = await build({ budget: { usd: 10 }, nodes: agents });
    expect(rulesOf(auditTower(ok), 'AUD10')).toEqual([]);
  });
});

describe('AUD11 shell tool with no sandbox', () => {
  it('fires on bash without a sandbox, quiet with one', async () => {
    const bad = await build({ nodes: [{ id: 'a', type: 'agent', model: 'm', tools: ['Bash(git:*)'] }] });
    expect(rulesOf(auditTower(bad), 'AUD11')).toHaveLength(1);
    const ok = await build({ nodes: [{ id: 'a', type: 'agent', model: 'm', tools: ['Bash(git:*)'], sandbox: { network: 'none' } }] });
    expect(rulesOf(auditTower(ok), 'AUD11')).toEqual([]);
  });
});

describe('AUD08 nesting deeper than 3 levels', () => {
  /** A workspace where each tower opens the next through a node: `chain[0]` is the root. */
  async function chain(ids: string[]): Promise<Workspace> {
    const towers: Record<string, ResolvedTower> = {};
    for (let i = 0; i < ids.length; i++) {
      const sub = ids[i + 1];
      const node = sub ? { id: 'sub', type: 'process', tower: sub } : { id: 'leaf', type: 'process' };
      towers[ids[i]] = await build({ nodes: [node] });
    }
    return { projects: [ids[0]], towers, loadedAt: '' };
  }

  it('is quiet within 3 levels', async () => {
    const ws = await chain(['a', 'b', 'c']);
    expect(auditNesting(ws, 'a')).toEqual([]);
  });

  it('flags the node that opens the 4th level', async () => {
    const ws = await chain(['a', 'b', 'c', 'd']);
    const fs = auditNesting(ws, 'a');
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ rule: 'AUD08', level: 'info', node: 'l.sub' });
  });

  it('a cycle of tower references ends without a loop', async () => {
    const ws = await chain(['a', 'b']);
    ws.towers.b = await build({ nodes: [{ id: 'sub', type: 'process', tower: 'a' }] });
    expect(auditNesting(ws, 'a')).toEqual([]);
  });

  it('an unknown root gives no findings', async () => {
    expect(auditNesting({ projects: [], towers: {}, loadedAt: '' }, 'missing')).toEqual([]);
  });
});

describe('inventory', () => {
  it('counts a small tower', async () => {
    const t = await build({
      budget: { usd: 5 },
      runtimes: { box: { kind: 'server' } },
      nodes: [
        { id: 'a', type: 'agent', model: 'm1', runtime: 'box', limits: { retries: 1 } },
        { id: 'b', type: 'agent', model: 'm1', fanout: 2 },
        { id: 'c', type: 'process', tower: 'sub.tower.yaml' },
      ],
      edges: ['a -> b [spawn]', 'b -> c', 'c -> a [return]'],
      links: ['l.a -> l.c'],
    });
    const inv = inventory(t);
    expect(inv).toMatchObject({
      layers: 1,
      nodes: 3,
      nodesByType: { agent: 2, process: 1 },
      edges: { total: 4, links: 1, byKind: { flow: 2, return: 1, spawn: 1 } },
      agents: 2,
      models: { m1: 2 },
      runtimes: { declared: 1, byKind: { server: 1 } },
      withOps: { budget: 0, limits: 1, approval: 0, evals: 0, sandbox: 0, fanout: 1 },
      nestedTowers: ['l.c'],
      run: { budget: true, limits: false },
    });
    expect(JSON.parse(JSON.stringify(inv))).toEqual(inv);
  });
});

describe('gallery', () => {
  it('audits every example without throwing, and twice gives the same output', async () => {
    const { workspace } = await loadLibrary(['examples']);
    const towers = Object.values(workspace.towers);
    expect(towers.length).toBeGreaterThan(0);
    const first = towers.map((t) => [t.id, auditTower(t), inventory(t)]);
    const second = towers.map((t) => [t.id, auditTower(t), inventory(t)]);
    expect(second).toEqual(first);
  }, 30_000); // loads every example: past the 5 s default when the machine is busy
});
