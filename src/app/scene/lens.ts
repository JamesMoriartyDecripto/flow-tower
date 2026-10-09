import { LAYER_GAP } from '../theme';

/** How layers are arranged: stacked in a tower, or laid out side by side as a map seen from above. */
export type View = 'tower' | 'map';

/** Animated per-layer transform shared by layers and cross-layer links (read every frame). */
export interface LensState {
  x: Float32Array;
  /** Layer y in tower space (the tower group adds its own centering offset). */
  y: Float32Array;
  z: Float32Array;
  /** Uniform layer scale. */
  s: Float32Array;
  /** Bumped whenever a value moves, so links know when to rebuild their geometry. */
  version: number;
}

/** Magnification and extra vertical room by distance from the hovered layer (0, 1, 2+). */
const MAGNIFY = [0.14, 0.06, 0.02];
const ROOM = [0, 0.32, 0.5]; // cumulative extra gap, in LAYER_GAP units, pushed away from the hovered layer
const MAP_GAP = { x: 10, z: 7 }; // room between map sections (left gap also hosts the layer title)

export const createLens = (n: number): LensState => ({
  x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), s: new Float32Array(n).fill(1), version: 0,
});

/** Map grid shape for n plates of size w×d: about as wide as a 16:10 screen, in reading order. */
export function mapGrid(n: number, w: number, d: number) {
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * (d + MAP_GAP.z) * 1.6) / (w + MAP_GAP.x)))));
  const rows = Math.ceil(n / cols);
  return { cols, rows, width: cols * (w + MAP_GAP.x), depth: rows * (d + MAP_GAP.z) };
}

export interface Target { x: number; y: number; z: number; s: number }

/** Target transform of layer `i` (fisheye along the stack in tower view, grid cell in map view). */
export function lensTarget(i: number, spacing: number, hovered?: number, view: View = 'tower', n = 1, w = 0, d = 0): Target {
  if (view === 'map') {
    const { cols, rows } = mapGrid(n, w, d);
    const [col, row] = [i % cols, Math.floor(i / cols)];
    return {
      x: (col - (cols - 1) / 2) * (w + MAP_GAP.x),
      y: 0,
      z: (row - (rows - 1) / 2) * (d + MAP_GAP.z),
      s: hovered === i ? 1.05 : 1,
    };
  }
  const base = -i * LAYER_GAP * spacing;
  if (hovered === undefined) return { x: 0, y: base, z: 0, s: 1 };
  const dist = Math.abs(i - hovered);
  const room = ROOM[Math.min(dist, ROOM.length - 1)] * LAYER_GAP * spacing;
  return { x: 0, y: base + Math.sign(hovered - i) * room, z: 0, s: 1 + (MAGNIFY[dist] ?? 0) };
}

/** Eases every layer toward its target; returns true if anything moved. */
export function stepLens(lens: LensState, targets: (i: number) => Target, dt: number): boolean {
  const k = 1 - Math.exp(-dt * 9);
  let moved = false;
  for (let i = 0; i < lens.y.length; i++) {
    const t = targets(i);
    const d = [t.x - lens.x[i], t.y - lens.y[i], t.z - lens.z[i], t.s - lens.s[i]];
    if (d.some((v) => Math.abs(v) > 1e-4)) {
      lens.x[i] += d[0] * k;
      lens.y[i] += d[1] * k;
      lens.z[i] += d[2] * k;
      lens.s[i] += d[3] * k;
      moved = true;
    }
  }
  if (moved) lens.version++;
  return moved;
}
