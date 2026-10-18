import { describe, expect, it } from 'vitest';
import { buildTower } from '../src/core/loader';
import { classifyNode } from '../src/core/roles';
import { TowerSchema, type TowerDef } from '../src/core/schema';
import type { ResolvedNode, ResolvedTower } from '../src/core/types';

const none = { read: async () => undefined };

async function build(def: Partial<TowerDef> & { nodes: Record<string, unknown>[]; edges?: string[] }): Promise<ResolvedTower> {
  const { nodes, edges = [], ...rest } = def;
  const parsed = TowerSchema.parse({ name: 'T', ...rest, layers: [{ id: 'l', title: 'L', nodes, edges }] });
  return buildTower(parsed, 't', none, []);
}

/** The single resolved node of a one-node tower. */
async function one(node: Record<string, unknown>): Promise<ResolvedNode> {
  const t = await build({ nodes: [{ id: 'n', ...node }] });
  return t.layers[0].nodes[0];
}

// Role words in id and label beat the tools a node carries: a writer with Read and Write is a writer.
describe('classifyNode: role words before tools', () => {
  it('a copywriter with a spawn edge and Read/Write is writing', async () => {
    const n = await one({ id: 'copywriter', type: 'agent', model: 'm', tools: ['Read', 'Write'] });
    expect(classifyNode(n, true).role).toBe('writing');
  });

  it('store metadata, ASO keywords and spec labels are writing', async () => {
    expect(classifyNode(await one({ label: 'Store metadata', type: 'agent', model: 'm', tools: ['Read', 'Write'] })).role).toBe('writing');
    expect(classifyNode(await one({ label: 'ASO keywords', type: 'agent', model: 'm' })).role).toBe('writing');
    expect(classifyNode(await one({ label: 'Spec & flows', type: 'agent', model: 'm' })).role).toBe('writing');
  });

  it('a doc writer with Edit is writing, not coding', async () => {
    const n = await one({ id: 'doc_writer', type: 'agent', model: 'm', tools: ['Read', 'Edit'] });
    expect(classifyNode(n).role).toBe('writing');
  });

  it('"specialist" does not match the exact word spec', async () => {
    expect(classifyNode(await one({ label: 'Specialist', type: 'agent', model: 'm', tools: ['Write'] }))).toEqual({
      role: 'general',
      why: 'no fact matched a specific role',
    });
  });

  it('a lead scorer is a router, since router words come before orchestrator words', async () => {
    expect(classifyNode(await one({ label: 'Lead scorer', type: 'agent', model: 'm' })).role).toBe('router');
  });

  it('bug triage is a router', async () => {
    expect(classifyNode(await one({ label: 'Bug triage', type: 'agent', model: 'm' })).role).toBe('router');
  });

  it('release monitor is data', async () => {
    expect(classifyNode(await one({ label: 'Release monitor', type: 'agent', model: 'm' })).role).toBe('data');
  });

  it('release manager with Bash is an orchestrator', async () => {
    expect(classifyNode(await one({ label: 'Release manager', type: 'agent', model: 'm', tools: ['Bash'] })).role).toBe('orchestrator');
  });

  it('a be_lead id splits into tokens and is an orchestrator', async () => {
    expect(classifyNode(await one({ id: 'be_lead', type: 'agent', model: 'm' })).role).toBe('orchestrator');
  });

  it('coding words in the label win over a spawn edge', async () => {
    expect(classifyNode(await one({ label: 'Coding LLM', type: 'agent', model: 'm' }), true).role).toBe('coding');
  });

  it('"prog" as a token is coding, but "progress" is not', async () => {
    expect(classifyNode(await one({ label: 'Gameplay prog', type: 'agent', model: 'm' })).role).toBe('coding');
    expect(classifyNode(await one({ label: 'Progress report', type: 'agent', model: 'm' })).role).toBe('general');
  });

  it('a lead auditor with Bash is review', async () => {
    expect(classifyNode(await one({ label: 'Lead auditor', type: 'agent', model: 'm', tools: ['Bash'] })).role).toBe('review');
  });

  it('Write alone is not coding, but Edit is', async () => {
    expect(classifyNode(await one({ id: 'worker', type: 'agent', model: 'm', tools: ['Read', 'Write'] })).role).toBe('general');
    expect(classifyNode(await one({ id: 'worker', type: 'agent', model: 'm', tools: ['Read', 'Edit'] })).role).toBe('coding');
  });

  it('the why of copywriter names the copy word, since the token starts with copy and not writ', async () => {
    const n = await one({ id: 'copywriter', type: 'agent', model: 'm', tools: ['Read', 'Write'] });
    expect(classifyNode(n, true).why).toBe('"copy" in id or label');
  });
});
