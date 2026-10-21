import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResolvedNode, ResolvedTower } from '../src/core/types';

let narrate: typeof import('../src/app/voice/narrate');
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  narrate = await import('../src/app/voice/narrate');
});

/** A node of the test tower: only the fields the narration reads. */
const node = (layer: string, i: number, description?: string): ResolvedNode => ({
  id: `n${i}`, key: `${layer}.n${i}`, layer, type: 'agent', label: `Node ${i}`, description, tools: [], files: [],
  optionalFiles: [], missingOptional: [], status: 'active', resources: [], ops: {}, meta: {},
} as unknown as ResolvedNode);

/** A tower with a small first layer and a 12-node second layer, the one the summary has to cut. */
const towerOf = (small: number, big: number): ResolvedTower => {
  const layers = [
    { id: 'small', index: 0, title: 'Small', description: 'Does a few things. And more.', nodes: Array.from({ length: small }, (_, i) => node('small', i, `Desc ${i}. Extra.`)), edges: [] },
    { id: 'big', index: 1, title: 'Big', description: undefined, nodes: Array.from({ length: big }, (_, i) => node('big', i, 'A long description '.repeat(30))), edges: [] },
  ];
  return { id: 't', name: 'T', tags: [], runtimes: {}, layers, links: [], issues: [] } as unknown as ResolvedTower;
};

describe('parts and the brief', () => {
  it('needs one call per 10 nodes, at least one', () => {
    const t = towerOf(3, 12);
    expect(narrate.parts(t, 0)).toBe(1);
    expect(narrate.parts(t, 1)).toBe(2);
    expect(narrate.parts(towerOf(0, 0), 0)).toBe(1);
  });

  it('lists every node in summary mode and only the slice in details mode, with descriptions cut to 300', () => {
    const t = towerOf(3, 12);
    expect(narrate.layerBrief(t, 1).nodes).toHaveLength(12);
    expect(narrate.layerBrief(t, 1).total).toBe(12);
    const second = narrate.layerBrief(t, 1, 1);
    expect(second.nodes.map((n) => n.key)).toEqual(['big.n10', 'big.n11']);
    expect(second.total).toBe(12);
    expect(narrate.layerBrief(t, 1).nodes[0].description).toHaveLength(300);
    expect(narrate.layerBrief(t, 0).description).toBe('Does a few things. And more.');
  });
});

describe('checkNarration', () => {
  const keys = ['a', 'b', 'c'];
  it('drops unknown keys, duplicates and empty sentences, and trims what is kept', () => {
    const got = narrate.checkNarration({
      intro: '  Intro.  ',
      lines: [
        { key: 'a', sentence: ' First. ' },
        { key: 'a', sentence: 'Again.' },
        { key: 'zz', sentence: 'Unknown.' },
        { key: 'b', sentence: '   ' },
        { key: 'c', sentence: 'Third.' },
      ],
    }, keys);
    expect(got).toEqual({ intro: 'Intro.', lines: [{ key: 'a', sentence: 'First.' }, { key: 'c', sentence: 'Third.' }] });
  });

  it('keeps at most PER_CALL lines, counted after the filters', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, sentence: `S${i}.` }));
    const bad = [{ key: 'nope', sentence: 'x' }, ...many];
    const got = narrate.checkNarration({ intro: 'I.', lines: bad }, many.map((l) => l.key));
    expect(got?.lines).toHaveLength(narrate.PER_CALL);
    // The unknown key is dropped; the one valid line after it is kept.
    expect(narrate.checkNarration({ intro: 'I.', lines: bad.slice(0, 2) }, many.map((l) => l.key))?.lines).toEqual([{ key: 'k0', sentence: 'S0.' }]);
  });

  it('is undefined when there is no intro and no line left, and rejects non-objects', () => {
    expect(narrate.checkNarration({ intro: '  ', lines: [{ key: 'zz', sentence: 'x' }] }, keys)).toBeUndefined();
    expect(narrate.checkNarration('text', keys)).toBeUndefined();
    expect(narrate.checkNarration(undefined, keys)).toBeUndefined();
    // An intro alone is still a narration.
    expect(narrate.checkNarration({ intro: 'Only this.', lines: [] }, keys)).toEqual({ intro: 'Only this.', lines: [] });
  });
});

describe('towerNarration', () => {
  it("speaks the tower's own text for a small layer: title and first sentence, label and first sentence per node", () => {
    const got = narrate.towerNarration(towerOf(3, 12), 0, true);
    expect(got.intro).toBe('Small. Does a few things.');
    expect(got.lines).toEqual([
      { key: 'small.n0', sentence: 'Node 0: Desc 0.' },
      { key: 'small.n1', sentence: 'Node 1: Desc 1.' },
      { key: 'small.n2', sentence: 'Node 2: Desc 2.' },
    ]);
    expect(got.rest).toBeUndefined();
  });

  it('cuts a 12-node summary to the first 10 with "And 2 more."', () => {
    const got = narrate.towerNarration(towerOf(3, 12), 1, false);
    expect(got.lines).toHaveLength(10);
    expect(got.rest).toBe('And 2 more.');
    // The label leads the line, then the node's own text.
    expect(got.lines[0].sentence.startsWith('Node 0: A long description')).toBe(true);
  });

  it('gives the second part of a details layer its own slice, with no intro', () => {
    const got = narrate.towerNarration(towerOf(3, 12), 1, true, 1);
    expect(got.intro).toBe('');
    expect(got.lines.map((l) => l.key)).toEqual(['big.n10', 'big.n11']);
    expect(narrate.towerNarration(towerOf(3, 12), 1, true, 0).intro).toBe('Big');
  });
});

describe('narrateLayer', () => {
  const toolReply = (args: unknown) => new Response(JSON.stringify({
    message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'narrate_layer', arguments: JSON.stringify(args) } }] },
    ms: 1, cost: 0.002,
  }));

  it('turns a good tool call into a narration, mapping node to key, and sends the brief and the tool', async () => {
    const bodies: { messages: { role: string; content: string }[]; tools: unknown[]; stream?: boolean }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(url).toBe('/api/voice/chat');
      bodies.push(JSON.parse(init.body as string));
      return toolReply({ intro: 'Sets the scene.', lines: [{ node: 'small.n0', sentence: 'Starts it.' }, { node: 'x', sentence: 'Ignored.' }] });
    });
    const got = await narrate.narrateLayer(towerOf(3, 12), 0, { said: 'tell me about layer one' });
    expect(got).toEqual({ intro: 'Sets the scene.', lines: [{ key: 'small.n0', sentence: 'Starts it.' }], cost: 0.002, fallback: false });
    const sent = bodies[0];
    expect(sent.stream).toBeUndefined();
    expect(sent.tools).toEqual([narrate.NARRATE_TOOL]);
    expect(sent.messages[0].content).toContain('narrate_layer');
    expect(sent.messages[1].content).toContain('tell me about layer one');
    expect(sent.messages[1].content).toContain('"total":3');
  });

  it("falls back to the tower's own text when the reply has no tool call", async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: { role: 'assistant', content: 'Just text.' }, ms: 1, cost: 0 })));
    const got = await narrate.narrateLayer(towerOf(3, 12), 0, { said: 'x' });
    expect(got.fallback).toBe(true);
    expect(got.lines).toHaveLength(3);
    expect(got.intro).toBe('Small. Does a few things.');
  });

  it('falls back when the HTTP call fails', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"busy"}', { status: 429 }));
    const got = await narrate.narrateLayer(towerOf(3, 12), 1, { said: 'x' });
    expect(got.fallback).toBe(true);
    expect(got.rest).toBe('And 2 more.');
  });

  it('rethrows an aborted tour instead of narrating around it', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', async () => { throw new DOMException('aborted', 'AbortError'); });
    await expect(narrate.narrateLayer(towerOf(3, 12), 0, { said: 'x' }, controller.signal)).rejects.toThrow();
  });
});
