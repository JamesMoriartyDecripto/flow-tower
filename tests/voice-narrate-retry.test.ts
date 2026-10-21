import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResolvedNode, ResolvedTower } from '../src/core/types';

let narrate: typeof import('../src/app/voice/narrate');
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  narrate = await import('../src/app/voice/narrate');
});

const node = (layer: string, i: number): ResolvedNode => ({
  id: `n${i}`, key: `${layer}.n${i}`, layer, type: 'agent', label: `Node ${i}`, description: `Desc ${i}. Extra.`, tools: [], files: [],
  optionalFiles: [], missingOptional: [], status: 'active', resources: [], ops: {}, meta: {},
} as unknown as ResolvedNode);

const tower = (): ResolvedTower => ({
  id: 't', name: 'T', tags: [], runtimes: {}, links: [], issues: [],
  layers: [{ id: 'small', index: 0, title: 'Small', description: 'Does a few things.', nodes: [node('small', 0), node('small', 1)], edges: [] }],
} as unknown as ResolvedTower);

const toolReply = (args: unknown, cost: number) => new Response(JSON.stringify({
  message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'narrate_layer', arguments: JSON.stringify(args) } }] },
  ms: 1, cost,
}));
const textReply = (cost: number) => new Response(JSON.stringify({ message: { role: 'assistant', content: 'Reasoning only.' }, ms: 1, cost }));
const good = { intro: 'Sets the scene.', lines: [{ node: 'small.n0', sentence: 'Starts it.' }] };

describe('narrateLayer retries once before it falls back', () => {
  it('takes the good second reply after a reply with no tool call, sums the cost, and sends the same messages', async () => {
    const bodies: string[] = [];
    const replies = [textReply(0.001), toolReply(good, 0.002)];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(init.body as string);
      return replies.shift()!;
    });
    const got = await narrate.narrateLayer(tower(), 0, { said: 'x' });
    expect(got).toEqual({ intro: 'Sets the scene.', lines: [{ key: 'small.n0', sentence: 'Starts it.' }], cost: 0.003, fallback: false });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  it('falls back to the tower text after two bad replies, with both costs', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => { calls++; return textReply(0.001); });
    const got = await narrate.narrateLayer(tower(), 0, { said: 'x' });
    expect(calls).toBe(2);
    expect(got.fallback).toBe(true);
    expect(got.cost).toBeCloseTo(0.002);
    expect(got.lines).toHaveLength(2);
  });

  it('retries a failed request once and then recovers', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return calls === 1 ? new Response('{"error":"busy"}', { status: 429 }) : toolReply(good, 0);
    });
    const got = await narrate.narrateLayer(tower(), 0, { said: 'x' });
    expect(calls).toBe(2);
    expect(got.fallback).toBe(false);
  });

  it('rethrows an abort after one call, without retrying', async () => {
    const controller = new AbortController();
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(narrate.narrateLayer(tower(), 0, { said: 'x' }, controller.signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
