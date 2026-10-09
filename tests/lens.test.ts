import { describe, expect, it } from 'vitest';
import { createLens, lensTarget, mapGrid, stepLens } from '../src/app/scene/lens';
import { LAYER_GAP } from '../src/app/theme';

describe('lens (tower view)', () => {
  it('magnifies the hovered layer most and spreads neighbours away from it', () => {
    const t = (i: number) => lensTarget(i, 1, 5);
    expect(t(5).s).toBeGreaterThan(t(4).s);
    expect(t(4).s).toBeGreaterThan(t(2).s);
    expect(t(4).y).toBeGreaterThan(-4 * LAYER_GAP); // above moves up
    expect(t(6).y).toBeLessThan(-6 * LAYER_GAP); // below moves down
    expect(t(5).y).toBe(-5 * LAYER_GAP); // hovered stays put
  });

  it('is the identity without hover, and settles', () => {
    expect(lensTarget(3, 1)).toEqual({ x: 0, y: -3 * LAYER_GAP, z: 0, s: 1 });
    const lens = createLens(4);
    const target = (i: number) => lensTarget(i, 1, 2);
    for (let k = 0; k < 400; k++) stepLens(lens, target, 1 / 60);
    const v = lens.version;
    expect(stepLens(lens, target, 1 / 60)).toBe(false);
    expect(lens.version).toBe(v);
    expect(lens.s[2]).toBeCloseTo(1.14, 3);
  });
});

describe('map view', () => {
  it('lays sections out in reading order on the ground plane, without overlaps', () => {
    const n = 14;
    const [w, d] = [45, 15];
    const g = mapGrid(n, w, d);
    expect(g.cols * g.rows).toBeGreaterThanOrEqual(n);
    const cells = Array.from({ length: n }, (_, i) => lensTarget(i, 1, undefined, 'map', n, w, d));
    expect(cells.every((c) => c.y === 0)).toBe(true);
    expect(cells[1].x).toBeGreaterThan(cells[0].x); // left to right
    expect(cells[g.cols].z).toBeGreaterThan(cells[0].z); // then next row
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const overlap = Math.abs(cells[i].x - cells[j].x) < w && Math.abs(cells[i].z - cells[j].z) < d;
      expect(overlap).toBe(false);
    }
  });
});
