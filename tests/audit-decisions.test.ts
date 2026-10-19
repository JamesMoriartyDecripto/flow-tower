import { describe, expect, it } from 'vitest';
import { auditTower, type Finding } from '../src/core/audit';
import { buildTower } from '../src/core/loader';
import { TowerSchema, type TowerDef } from '../src/core/schema';
import type { ResolvedTower } from '../src/core/types';

const none = { read: async () => undefined };

/** Builds a resolved tower from a plain definition, the same way the loader does. */
async function build(def: Partial<TowerDef> & { nodes: Record<string, unknown>[]; edges?: unknown[]; links?: string[] }): Promise<ResolvedTower> {
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

/** An agent that carries the model, so the tower is one that runs a model. */
const agentX = { id: 'x', type: 'agent', model: 'm' };

describe('AUD04 decision edges', () => {
  it('fires on a plain single edge from a decision', async () => {
    const t = await build({ nodes: [agentX, { id: 'd', type: 'decision', decision: { output: 'binary', fail: 'closed' } }, { id: 'y', type: 'output' }], edges: ['d -> y'] });
    expect(rulesOf(auditTower(t), 'AUD04')).toHaveLength(1);
  });

  it('is quiet when the single edge carries a condition', async () => {
    const t = await build({
      nodes: [agentX, { id: 'd', type: 'decision', decision: { output: 'binary', fail: 'closed' } }, { id: 'y', type: 'output' }],
      edges: [{ from: 'd', to: 'y', condition: 'answer == yes' }],
    });
    expect(rulesOf(auditTower(t), 'AUD04')).toEqual([]);
  });

  it('is quiet when the target is a plain node that branches', async () => {
    const t = await build({
      nodes: [agentX, { id: 'd', type: 'decision', decision: { output: 'binary', fail: 'closed' } }, { id: 'p', type: 'process' }, { id: 'y1', type: 'output' }, { id: 'y2', type: 'output' }],
      edges: ['d -> p', 'p -> y1', 'p -> y2'],
    });
    expect(rulesOf(auditTower(t), 'AUD04')).toEqual([]);
  });

  it('fires when the target is an agent that branches', async () => {
    const t = await build({
      nodes: [agentX, { id: 'd', type: 'decision', decision: { output: 'binary', fail: 'closed' } }, { id: 'a', type: 'agent', model: 'm' }, { id: 'y1', type: 'output' }, { id: 'y2', type: 'output' }],
      edges: ['d -> a', 'a -> y1', 'a -> y2'],
    });
    expect(rulesOf(auditTower(t), 'AUD04')).toHaveLength(1);
  });

  it('is quiet in an agent-less tower with no model anywhere', async () => {
    const t = await build({ nodes: [{ id: 'd', type: 'decision', decision: { output: 'binary', fail: 'closed' } }, { id: 'y', type: 'output' }], edges: ['d -> y'] });
    expect(rulesOf(auditTower(t), 'AUD04')).toEqual([]);
  });

  it('asks for fail only when the decision runs a model', async () => {
    const agentless = await build({ nodes: [{ id: 'd', type: 'decision', decision: { output: 'binary' } }, { id: 'y1', type: 'output' }, { id: 'y2', type: 'output' }], edges: ['d -> y1', 'd -> y2'] });
    expect(rulesOf(auditTower(agentless), 'AUD04')).toEqual([]);

    const withNodeModel = await build({ nodes: [{ id: 'd', type: 'decision', model: 'm', decision: { output: 'binary' } }, { id: 'y1', type: 'output' }, { id: 'y2', type: 'output' }], edges: ['d -> y1', 'd -> y2'] });
    expect(rulesOf(auditTower(withNodeModel), 'AUD04')).toHaveLength(1);

    const withDecisionModel = await build({ nodes: [{ id: 'd', type: 'decision', decision: { output: 'binary', model: 'jev-1' } }, { id: 'y1', type: 'output' }, { id: 'y2', type: 'output' }], edges: ['d -> y1', 'd -> y2'] });
    expect(rulesOf(auditTower(withDecisionModel), 'AUD04')).toHaveLength(1);
  });
});

describe('AUD07 dead ends, exemptions', () => {
  // The agent leads to an output, so it is never a dead end and only the node under test can fire AUD07.
  const agentToOutput = [agentX, { id: 'y', type: 'output' }];
  const wired = ['x -> y'];

  it('is quiet for a planned process with no edges', async () => {
    const t = await build({ nodes: [...agentToOutput, { id: 'p', type: 'process', status: 'planned' }], edges: wired });
    expect(rulesOf(auditTower(t), 'AUD07')).toEqual([]);
  });

  it('is quiet for a human at the end of a lane', async () => {
    const t = await build({ nodes: [...agentToOutput, { id: 'p', type: 'process' }, { id: 'h', type: 'human' }], edges: [...wired, 'p -> h'] });
    expect(rulesOf(auditTower(t), 'AUD07')).toEqual([]);
  });

  it('fires on a human with no edges at all', async () => {
    const t = await build({ nodes: [...agentToOutput, { id: 'h', type: 'human' }], edges: wired });
    expect(rulesOf(auditTower(t), 'AUD07')).toHaveLength(1);
  });

  it('is quiet for a guard that is reached', async () => {
    const t = await build({ nodes: [...agentToOutput, { id: 'p', type: 'process' }, { id: 'g', type: 'guard' }], edges: [...wired, 'p -> g'] });
    expect(rulesOf(auditTower(t), 'AUD07')).toEqual([]);
  });
});

describe('AUD09 agent without a model, exemptions', () => {
  it('is quiet for an agent with a nested tower', async () => {
    const t = await build({ nodes: [{ id: 'a', type: 'agent', tower: 'sub.tower.yaml' }] });
    expect(rulesOf(auditTower(t), 'AUD09')).toEqual([]);
  });

  it('is quiet when the model is chosen at run time', async () => {
    const t = await build({ nodes: [{ id: 'a', type: 'agent', model_varies: 'benchmark candidate' }] });
    expect(rulesOf(auditTower(t), 'AUD09')).toEqual([]);
  });

  it('fires on a plain agent with no model', async () => {
    const t = await build({ nodes: [{ id: 'a', type: 'agent' }] });
    expect(rulesOf(auditTower(t), 'AUD09')).toHaveLength(1);
  });
});
