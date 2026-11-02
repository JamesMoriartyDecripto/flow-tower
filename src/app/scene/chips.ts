import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import type { TowerLayout } from '../layout';
import { LAYER_GAP } from '../theme';

/**
 * Bridge between the 3D scene and the DOM live chips: layers register their groups, chips register
 * their elements, and one projector moves every chip each frame (no React renders, no extra roots).
 */
export const layerGroups = new Map<string, Group>();
export const chipEls = new Map<string, HTMLElement>();

const v = new Vector3();

type Box = { x: number; y: number; w: number; h: number };

/** Two chips collide when their horizontal centres are closer than half the sum of widths and their vertical spans overlap. */
function overlaps(a: Box, b: Box) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y - a.h < b.y && b.y - b.h < a.y;
}

/**
 * Returns the bottom y of each chip after lifting colliding ones above the chips placed before them.
 * Order matters: boxes are placed in the given order, so earlier ones (errors) keep their place.
 */
export function stackChips(boxes: Box[]): number[] {
  const placed: Box[] = [];
  return boxes.map((box) => {
    let y = box.y;
    let hit = placed.find((p) => overlaps(p, { ...box, y }));
    // Each lift lands above the hit box, so y strictly decreases and the loop ends.
    while (hit) {
      y = hit.y - hit.h - 2;
      hit = placed.find((p) => overlaps(p, { ...box, y }));
    }
    placed.push({ ...box, y });
    return y;
  });
}

/** Projects each registered chip onto its node (above the live beam) in screen space. */
export function useChipProjector(layout: TowerLayout, layerIds: string[]) {
  useFrame(({ camera, size }) => {
    const shown: { el: HTMLElement; x: number; y: number }[] = [];
    for (const [key, el] of chipEls) {
      const layerId = key.slice(0, key.indexOf('.'));
      const group = layerGroups.get(layerId);
      const box = layout.layers[layerIds.indexOf(layerId)]?.nodes[key];
      if (!group || !box || !group.visible) { el.style.visibility = 'hidden'; continue; }
      v.set(box.x, LAYER_GAP * 0.55 + 0.7, box.z).applyMatrix4(group.matrixWorld).project(camera);
      if (v.z > 1) { el.style.visibility = 'hidden'; continue; } // behind the camera
      el.style.visibility = 'visible';
      shown.push({ el, x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height });
    }
    // Stack after projecting all chips so each one sees the final position of the chips before it.
    const ys = stackChips(shown.map(({ el, x, y }) => ({ x, y, w: el.offsetWidth, h: el.offsetHeight })));
    shown.forEach(({ el, x }, i) => {
      el.style.transform = `translate(-50%, -100%) translate(${x}px, ${ys[i]}px)`;
    });
  });
}
