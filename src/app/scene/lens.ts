import { LAYER_GAP } from '../theme';

/** Animated per-layer transform shared by layers and cross-layer links (read every frame). */
export interface LensState {
  /** Layer y in tower space (before the centering offset). */
  y: Float32Array;
  /** Uniform layer scale. */
  s: Float32Array;
  /** Bumped whenever a value moves, so links know when to rebuild their geometry. */
  version: number;
}

/** Magnification and extra vertical room by distance from the hovered layer (0, 1, 2+). */
const MAGNIFY = [0.14, 0.06, 0.02];
const ROOM = [0, 0.32, 0.5]; // cumulative extra gap, in LAYER_GAP units, pushed away from the hovered layer

export const createLens = (n: number): LensState => ({ y: new Float32Array(n), s: new Float32Array(n).fill(1), version: 0 });

/** Target transform of layer `i` for a given spacing and hovered layer (fisheye along the stack). */
export function lensTarget(i: number, spacing: number, hovered?: number): { y: number; s: number } {
  const base = -i * LAYER_GAP * spacing;
  if (hovered === undefined) return { y: base, s: 1 };
  const d = Math.abs(i - hovered);
  const room = ROOM[Math.min(d, ROOM.length - 1)] * LAYER_GAP * spacing;
  return { y: base + Math.sign(hovered - i) * room, s: 1 + (MAGNIFY[d] ?? 0) };
}

/** Eases every layer toward its target; returns true if anything moved. */
export function stepLens(lens: LensState, spacing: number, hovered: number | undefined, dt: number): boolean {
  const k = 1 - Math.exp(-dt * 9);
  let moved = false;
  for (let i = 0; i < lens.y.length; i++) {
    const t = lensTarget(i, spacing, hovered);
    const dy = t.y - lens.y[i];
    const ds = t.s - lens.s[i];
    if (Math.abs(dy) > 1e-4 || Math.abs(ds) > 1e-5) {
      lens.y[i] += dy * k;
      lens.s[i] += ds * k;
      moved = true;
    }
  }
  if (moved) lens.version++;
  return moved;
}
