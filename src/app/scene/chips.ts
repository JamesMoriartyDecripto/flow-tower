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

/** Projects each registered chip onto its node (above the live beam) in screen space. */
export function useChipProjector(layout: TowerLayout, layerIds: string[]) {
  useFrame(({ camera, size }) => {
    for (const [key, el] of chipEls) {
      const layerId = key.slice(0, key.indexOf('.'));
      const group = layerGroups.get(layerId);
      const box = layout.layers[layerIds.indexOf(layerId)]?.nodes[key];
      if (!group || !box || !group.visible) { el.style.visibility = 'hidden'; continue; }
      v.set(box.x, LAYER_GAP * 0.55 + 0.7, box.z).applyMatrix4(group.matrixWorld).project(camera);
      if (v.z > 1) { el.style.visibility = 'hidden'; continue; } // behind the camera
      el.style.visibility = 'visible';
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
}
