import { describe, expect, it } from 'vitest';
import { buildTower } from '../src/core/loader';
import { classifyNode, modelFit, ROLE_CLASSES } from '../src/core/roles';
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

describe('ROLE_CLASSES', () => {
  it('lists every role once, with the fields the optimizer reads', () => {
    const ids = ROLE_CLASSES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['coding', 'review', 'orchestrator', 'router', 'research', 'writing', 'data', 'voice-stt', 'voice-tts', 'realtime-voice', 'vision', 'image-gen', 'video-gen', 'embeddings', 'guard', 'general']));
    for (const r of ROLE_CLASSES) {
      expect(r.title).not.toBe('');
      expect(r.prefer).not.toBe('');
      expect(r.modality.in.length).toBeGreaterThan(0);
      expect(r.modality.out.length).toBeGreaterThan(0);
    }
  });
});

describe('classifyNode', () => {
  it('guard node type wins over everything', async () => {
    const n = await one({ type: 'guard', model: 'whisper-1', tools: ['bash'] });
    expect(classifyNode(n)).toEqual({ role: 'guard', why: 'node type is guard' });
  });

  it('decision node type is a router', async () => {
    const n = await one({ type: 'decision', decision: { output: 'binary', fail: 'closed' } });
    expect(classifyNode(n)).toEqual({ role: 'router', why: 'node type is decision' });
  });

  it('model id hint names a specialised role', async () => {
    const n = await one({ type: 'agent', model: 'openai/whisper-large-v3' });
    const r = classifyNode(n);
    expect(r.role).toBe('voice-stt');
    expect(r.why).toContain('whisper');
  });

  it('model id hint for embeddings', async () => {
    expect(classifyNode(await one({ type: 'agent', model: 'openai/text-embed-3' })).role).toBe('embeddings');
  });

  it('file or shell tools are coding', async () => {
    const n = await one({ type: 'agent', model: 'm', tools: ['Read', 'Bash(git:*)'] });
    const r = classifyNode(n);
    expect(r.role).toBe('coding');
    expect(r.why).toContain('bash');
  });

  it('web or fetch tools are research', async () => {
    const n = await one({ type: 'agent', model: 'm', tools: ['mcp__box__web_search'] });
    expect(classifyNode(n).role).toBe('research');
  });

  it('an outgoing spawn edge makes an orchestrator', async () => {
    const t = await build({ nodes: [{ id: 'a', type: 'agent', model: 'm' }, { id: 'b', type: 'agent', model: 'm' }], edges: ['a -> b [spawn]'] });
    const n = t.layers[0].nodes.find((x) => x.id === 'a')!;
    expect(classifyNode(n, true)).toEqual({ role: 'orchestrator', why: 'has an outgoing spawn edge' });
    expect(classifyNode(n).role).toBe('general');
  });

  it('keywords in the label decide review, writing, data, router', async () => {
    expect(classifyNode(await one({ type: 'agent', model: 'm', label: 'Code judge' })).role).toBe('review');
    expect(classifyNode(await one({ type: 'agent', model: 'm', label: 'Draft the reply' })).role).toBe('writing');
    expect(classifyNode(await one({ type: 'agent', model: 'm', description: 'parse invoices' })).role).toBe('data');
    expect(classifyNode(await one({ type: 'agent', model: 'm', label: 'Classify ticket' })).role).toBe('router');
  });

  it('keyword match names the word that matched', async () => {
    const r = classifyNode(await one({ type: 'agent', model: 'm', label: 'Review PR' }));
    expect(r.why).toContain('review');
  });

  it('falls back to general when no fact matches', async () => {
    expect(classifyNode(await one({ type: 'agent', model: 'm', label: 'Thing' }))).toEqual({
      role: 'general',
      why: 'no fact matched a specific role',
    });
  });

  it('node type outranks a model hint', async () => {
    const n = await one({ type: 'guard', model: 'whisper-1' });
    expect(classifyNode(n).role).toBe('guard');
  });
});

describe('modelFit', () => {
  it('returns one entry per agent or model node, with the role class fields', async () => {
    const t = await build({
      nodes: [
        { id: 'a', type: 'agent', model: 'openai/whisper-1' },
        { id: 'p', type: 'process' },
        { id: 'm', type: 'model', model: 'x/y' },
      ],
    });
    const fits = modelFit(t);
    expect(fits.map((f) => f.node)).toEqual(['l.a', 'l.m']);
    expect(fits[0]).toMatchObject({ role: 'voice-stt', model: 'openai/whisper-1' });
    expect(fits[0].needs).toContain('streaming-audio');
  });

  it('reads the orchestrator role from the tower edges', async () => {
    const t = await build({ nodes: [{ id: 'a', type: 'agent', model: 'm' }, { id: 'b', type: 'agent', model: 'm' }], edges: ['a -> b [spawn]'] });
    expect(modelFit(t).find((f) => f.node === 'l.a')?.role).toBe('orchestrator');
  });
});
