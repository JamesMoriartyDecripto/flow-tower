import { describe, expect, it } from 'vitest';
import { buildTower } from '../src/core/loader';
import { classifyNode, ROLE_CLASSES } from '../src/core/roles';
import { TowerSchema, type TowerDef } from '../src/core/schema';
import type { ResolvedNode, ResolvedTower } from '../src/core/types';
// @ts-expect-error plain Node script with no type declarations, imported on purpose
import { ROLE_FILTERS, capPerFamily, dropVariants, familyOf, meets } from '../skills/flow-tower-costs/roles.mjs';

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

describe('ROLE_FILTERS', () => {
  it('has an entry for every role class, and no other', () => {
    const classIds = ROLE_CLASSES.map((r) => r.id).sort();
    expect(Object.keys(ROLE_FILTERS).sort()).toEqual(classIds);
    expect(classIds).toHaveLength(18);
  });
});

describe('meets', () => {
  const text = { supported_parameters: ['tools'], architecture: { input_modalities: ['text'], output_modalities: ['text'] } };
  const plain = { supported_parameters: [], architecture: { input_modalities: ['text'], output_modalities: ['text'] } };
  const vision = { supported_parameters: [], architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } };

  it('a text model with tools meets coding, one without does not', () => {
    expect(meets(text, ROLE_FILTERS.coding.needs)).toBe(true);
    expect(meets(plain, ROLE_FILTERS.coding.needs)).toBe(false);
  });

  it('a model with image input meets vision', () => {
    expect(meets(vision, ROLE_FILTERS.vision.needs)).toBe(true);
    expect(meets(plain, ROLE_FILTERS.vision.needs)).toBe(false);
  });

  it('no needs means every model meets', () => {
    expect(meets(plain, [])).toBe(true);
  });
});

describe('familyOf', () => {
  it('takes the part before the slash, without a leading ~', () => {
    expect(familyOf('~perplexity/pplx-decider-latest')).toBe('perplexity');
    expect(familyOf('openai/gpt-4o')).toBe('openai');
  });
});

describe('dropVariants', () => {
  it('drops ":batch" and "~" alias ids, keeps the rest in order', () => {
    const models = [{ id: 'openai/gpt-4o' }, { id: 'openai/gpt-4o:batch' }, { id: '~openai/gpt-latest' }, { id: 'mistralai/mistral-nemo:free' }];
    expect(dropVariants(models).map((m: { id: string }) => m.id)).toEqual(['openai/gpt-4o', 'mistralai/mistral-nemo:free']);
  });
});

describe('capPerFamily', () => {
  it('keeps the first n models of each family, in the order given', () => {
    const models = [
      { id: 'a/1' }, { id: 'b/1' }, { id: 'a/2' }, { id: 'a/3' }, { id: 'b/2' }, { id: '~b/3' },
    ];
    expect(capPerFamily(models, 2).map((m: { id: string }) => m.id)).toEqual(['a/1', 'b/1', 'a/2', 'b/2']);
  });
});

describe('classifyNode with the decision and rerank roles', () => {
  it('a minimal decision node is a decision', async () => {
    const n = await one({ type: 'decision', decision: { output: 'binary', fail: 'closed' } });
    expect(classifyNode(n).role).toBe('decision');
  });

  it('a decision model id is a decision', async () => {
    expect(classifyNode(await one({ type: 'agent', model: 'typesafe/jev-1.14' })).role).toBe('decision');
  });

  it('a rerank model id is a rerank', async () => {
    expect(classifyNode(await one({ type: 'agent', model: 'voyageai/rerank-3' })).role).toBe('rerank');
  });

  it('an embeddings model is still embeddings', async () => {
    expect(classifyNode(await one({ type: 'agent', model: 'openai/text-embedding-3-small' })).role).toBe('embeddings');
  });
});
