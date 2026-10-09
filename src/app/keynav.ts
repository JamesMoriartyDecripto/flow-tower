import type { CameraControls } from '@react-three/drei';
import type { ResolvedTower } from '../core/types';
import type { NodeBox, TowerLayout } from './layout';
import { nearest, type Dir } from './spatial';

export type { Dir };
import { keepAlive } from './scene/frameBudget';
import { useStore } from './store';

/**
 * Keyboard navigation of the scene. Arrows move spatially (like a TV remote): to the nearest node in
 * that direction inside the layer, and across to the layer above / below at the top or bottom edge.
 */

const layouts = new Map<string, TowerLayout>();
/** The scene publishes its layout here, so keyboard navigation knows where nodes are. */
export const publishLayout = (towerId: string, layout: TowerLayout) => layouts.set(towerId, layout);

function boxes(tower: ResolvedTower, layer: number): NodeBox[] {
  const layout = layouts.get(tower.id)?.layers[layer];
  const hidden = useStore.getState().hiddenTypes;
  if (!layout) return [];
  return tower.layers[layer].nodes.filter((n) => !hidden.has(n.type) && layout.nodes[n.key]).map((n) => layout.nodes[n.key]);
}

function pick(layer: number, key: string) {
  const s = useStore.getState();
  s.select(key);
  if (s.focusedLayer !== layer) s.focusLayer(layer);
}

/** ↑ / ↓ without a selection, PageUp / PageDown always: previous / next layer; past the ends = overview. */
export function stepLayer(tower: ResolvedTower, delta: number) {
  const s = useStore.getState();
  const n = tower.layers.length;
  const cur = s.focusedLayer;
  const next = cur === undefined ? (delta > 0 ? 0 : n - 1) : cur + delta;
  s.select(undefined);
  if (next < 0 || next >= n) s.resetView();
  else s.focusLayer(next);
}

export function navigate(tower: ResolvedTower, dir: Dir) {
  const s = useStore.getState();
  const layer = s.selected ? tower.layers.findIndex((l) => l.nodes.some((n) => n.key === s.selected)) : -1;
  if (layer < 0) {
    if (dir === 'up' || dir === 'down') return stepLayer(tower, dir === 'down' ? 1 : -1);
    // ← / → in a layer with nothing selected: start of the flow (→) or its end (←).
    const li = s.focusedLayer ?? 0;
    const all = boxes(tower, li).sort((a, b) => a.x - b.x || a.z - b.z);
    const b = dir === 'right' ? all[0] : all[all.length - 1];
    if (b) pick(li, b.key);
    return;
  }
  const own = boxes(tower, layer);
  const from = own.find((b) => b.key === s.selected);
  if (!from) return;
  const target = nearest(own, from, dir);
  if (target) return pick(layer, target.key);
  if (dir === 'left' || dir === 'right') return;
  // Top / bottom edge: continue on the adjacent layer, on the node closest in x.
  const li = layer + (dir === 'down' ? 1 : -1);
  if (li < 0 || li >= tower.layers.length) return;
  const next = boxes(tower, li).sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x))[0];
  if (next) pick(li, next.key);
  else stepLayer(tower, dir === 'down' ? 1 : -1);
}

/** S / Shift+S: select the next / previous node that opens a sub-tower (Enter then dives in). */
export function nextSubTower(tower: ResolvedTower, step: number) {
  const subs = tower.layers.flatMap((l, li) => l.nodes.filter((n) => n.tower).map((n) => ({ key: n.key, li })));
  if (!subs.length) return;
  const i = subs.findIndex((x) => x.key === useStore.getState().selected);
  const next = subs[i < 0 ? (step > 0 ? 0 : subs.length - 1) : (i + step + subs.length) % subs.length];
  pick(next.li, next.key);
}

let camera: CameraControls | null = null;
export const publishCamera = (c: CameraControls | null) => { camera = c; };

/** Shift+arrows orbit, Alt+arrows pan, + / - zoom: the camera without a mouse. */
export function nudgeCamera(kind: 'orbit' | 'pan' | 'zoom', x: number, y = 0) {
  if (!camera) return;
  const step = camera.distance * 0.08;
  if (kind === 'orbit') camera.rotate(x * 0.26, y * 0.18, true);
  else if (kind === 'pan') camera.truck(x * step, y * step, true);
  else camera.dolly(x * step * 2, true);
  keepAlive(700);
}
