import { describe, expect, it } from 'vitest';
import { createLens, lensTarget, stepLens } from '../src/app/scene/lens';
import { LAYER_GAP } from '../src/app/theme';

describe('lens', () => {
  it('magnifies the hovered layer most and spreads neighbours away from it', () => {
    const t = (i: number) => lensTarget(i, 1, 5);
    expect(t(5).s).toBeGreaterThan(t(4).s);
    expect(t(4).s).toBeGreaterThan(t(2).s);
    expect(t(4).y).toBeGreaterThan(-4 * LAYER_GAP); // above moves up
    expect(t(6).y).toBeLessThan(-6 * LAYER_GAP); // below moves down
    expect(t(5).y).toBe(-5 * LAYER_GAP); // hovered stays put
  });

  it('is the identity without hover, and settles', () => {
    expect(lensTarget(3, 1)).toEqual({ y: -3 * LAYER_GAP, s: 1 });
    const lens = createLens(4);
    for (let k = 0; k < 400; k++) stepLens(lens, 1, 2, 1 / 60);
    const v = lens.version;
    expect(stepLens(lens, 1, 2, 1 / 60)).toBe(false);
    expect(lens.version).toBe(v);
    expect(lens.s[2]).toBeCloseTo(1.14, 3);
  });
});
