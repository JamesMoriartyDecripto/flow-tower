import { describe, expect, it } from 'vitest';
import { stackChips } from '../src/app/scene/chips';

describe('stackChips', () => {
  it('lifts a chip that lands on the same point above the first', () => {
    const first = { x: 100, y: 200, w: 80, h: 20 };
    const [y0, y1] = stackChips([first, { ...first }]);
    expect(y0).toBe(200);
    expect(y1).toBe(200 - 20 - 2);
  });

  it('keeps the y of chips that are far apart', () => {
    const ys = stackChips([
      { x: 0, y: 200, w: 80, h: 20 },
      { x: 500, y: 200, w: 80, h: 20 },
    ]);
    expect(ys).toEqual([200, 200]);
  });

  it('stacks three chips at one point into three levels', () => {
    const b = { x: 50, y: 300, w: 60, h: 16 };
    const ys = stackChips([b, { ...b }, { ...b }]);
    expect(ys).toEqual([300, 300 - 16 - 2, 300 - 2 * (16 + 2)]);
  });

  it('does not move a chip that only touches horizontally', () => {
    const a = { x: 0, y: 200, w: 80, h: 20 };
    const b = { x: 80, y: 200, w: 60, h: 20 }; // centres exactly (80 + 60) / 2 apart
    expect(stackChips([a, b])).toEqual([200, 200]);
  });
});
