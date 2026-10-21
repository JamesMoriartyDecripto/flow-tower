import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResolvedNode, ResolvedTower } from '../src/core/types';

let narrate: typeof import('../src/app/voice/narrate');
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  narrate = await import('../src/app/voice/narrate');
});
afterEach(() => vi.unstubAllGlobals());

const node = (i: number): ResolvedNode => ({
  id: `n${i}`, key: `big.n${i}`, layer: 'big', type: 'agent', label: `Node ${i}`, description: 'Short.', tools: [], files: [],
  optionalFiles: [], missingOptional: [], status: 'active', resources: [], ops: {}, meta: {},
} as unknown as ResolvedNode);

const tower = {
  id: 't', name: 'T', tags: [], runtimes: {}, links: [], issues: [],
  layers: [{ id: 'big', index: 0, title: 'Big', description: undefined, nodes: [node(0), node(1)], edges: [] }],
} as unknown as ResolvedTower;

const toolReply = (args: unknown) => new Response(JSON.stringify({
  message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'narrate_layer', arguments: JSON.stringify(args) } }] },
  ms: 1, cost: 0.002,
}));

/** Stubs the chat route with one reply per call and returns the calls it received. */
function stubChat(...replies: (() => Response)[]) {
  const bodies: { max_tokens?: number }[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    return replies[Math.min(bodies.length, replies.length) - 1]();
  });
  return bodies;
}

describe('narrateLayer limits (#275)', () => {
  it('asks for 1200 tokens of tool arguments', async () => {
    const bodies = stubChat(() => toolReply({ intro: 'Hi.', lines: [] }));
    await narrate.narrateLayer(tower, 0, { said: 'x' });
    expect(bodies[0].max_tokens).toBe(1200);
  });

  it('never retries a 503 (no key): one call, then the tower text', async () => {
    const bodies = stubChat(() => new Response('{"error":"no key"}', { status: 503 }));
    const got = await narrate.narrateLayer(tower, 0, { said: 'x' });
    expect(bodies).toHaveLength(1);
    expect(got.fallback).toBe(true);
  });

  it('retries a 429 once after a wait, then falls back: two calls', async () => {
    const bodies = stubChat(() => new Response('{"error":"busy"}', { status: 429 }));
    const got = await narrate.narrateLayer(tower, 0, { said: 'x' });
    expect(bodies).toHaveLength(2);
    expect(got.fallback).toBe(true);
  });

  it('does not retry another 4xx', async () => {
    const bodies = stubChat(() => new Response('{"error":"bad"}', { status: 400 }));
    await narrate.narrateLayer(tower, 0, { said: 'x' });
    expect(bodies).toHaveLength(1);
  });
});

describe('checkNarration length cap (#275)', () => {
  it('cuts a 1000-character sentence to at most 300 characters', () => {
    const long = 'word '.repeat(200).trim();
    const got = narrate.checkNarration({ intro: 'I.', lines: [{ key: 'k', sentence: long }] }, ['k']);
    const sentence = got!.lines[0].sentence;
    expect(sentence.length).toBeLessThanOrEqual(300);
    expect(sentence.endsWith('word')).toBe(true); // cut at a word boundary, not mid-word
  });

  it('caps the intro and rest too', () => {
    const got = narrate.checkNarration({ intro: 'a'.repeat(1000), rest: 'b'.repeat(1000), lines: [] }, []);
    expect(got!.intro.length).toBe(300);
    expect(got!.rest!.length).toBe(300);
  });
});
