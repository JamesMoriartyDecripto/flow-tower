import { beforeAll, describe, expect, it, vi } from 'vitest';
import { nearest } from '../src/app/spatial';
import type { ResolvedLayer } from '../src/core/types';

const box = (key: string, x: number, z: number) => ({ key, x, z, w: 1, d: 1 });
// a → b → c on one row, d below b.
const boxes = [box('a', 0, 0), box('b', 3, 0), box('c', 6, 0), box('d', 3, 2)];

describe('keyboard spatial navigation', () => {
  it('moves along the row', () => {
    expect(nearest(boxes, boxes[0], 'right')?.key).toBe('b');
    expect(nearest(boxes, boxes[2], 'left')?.key).toBe('b');
  });
  it('prefers the same column for up / down', () => {
    expect(nearest(boxes, boxes[1], 'down')?.key).toBe('d');
    expect(nearest(boxes, boxes[3], 'up')?.key).toBe('b');
  });
  it('returns nothing past the edge', () => {
    expect(nearest(boxes, boxes[2], 'right')).toBeUndefined();
    expect(nearest(boxes, boxes[0], 'up')).toBeUndefined();
  });
});

describe('flow order', () => {
  let flowOrder: typeof import('../src/app/keynav').flowOrder;
  let publishLayout: typeof import('../src/app/keynav').publishLayout;
  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    ({ flowOrder, publishLayout } = await import('../src/app/keynav'));
  });

  const node = (key: string) => ({ key, id: key, label: key, type: 'agent', status: 'active', tools: [], files: [], resources: [] }) as never;
  const layer = { id: 'l', index: 0, title: 'L', nodes: [node('c'), node('a'), node('b')], edges: [] } as ResolvedLayer;

  it('keeps the file order without a layout', () => {
    expect(flowOrder('no-such-tower', layer).map((n) => n.key)).toEqual(['c', 'a', 'b']);
  });

  it('reads left to right, then top to bottom, with a layout', () => {
    publishLayout('t', { layers: [{ index: 0, nodes: { c: box('c', 0, 0), a: box('a', 6, 0), b: box('b', 0, 2) }, edges: [] }] } as never);
    expect(flowOrder('t', layer).map((n) => n.key)).toEqual(['c', 'b', 'a']);
  });
});
