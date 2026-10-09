import { describe, expect, it } from 'vitest';
import { nearest } from '../src/app/spatial';

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
