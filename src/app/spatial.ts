import type { NodeBox } from './layout';

/** Pure spatial picking for keyboard navigation (no stores: unit-testable). */
export type Dir = 'left' | 'right' | 'up' | 'down';
const VEC: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** Nearest box in a direction; distance across the direction costs double, so rows/columns win. */
export function nearest(boxes: NodeBox[], from: { x: number; z: number }, dir: Dir): NodeBox | undefined {
  const [dx, dz] = VEC[dir];
  let best: NodeBox | undefined;
  let score = Infinity;
  for (const b of boxes) {
    const vx = b.x - from.x;
    const vz = b.z - from.z;
    const along = vx * dx + vz * dz;
    if (along <= 0.05) continue;
    const s = along + 2 * Math.abs(vx * dz - vz * dx);
    if (s < score) { score = s; best = b; }
  }
  return best;
}
