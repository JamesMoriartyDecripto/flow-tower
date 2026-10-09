import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import type { CameraControls } from '@react-three/drei';
import type { TowerLayout } from '../layout';
import { useLive } from '../live';
import { usePrefs } from '../settings';
import { useStore } from '../store';
import { layerGroups } from './chips';
import { keepAlive } from './frameBudget';

/**
 * The 3D view lives in the free area between the HUD panels, not behind them. The camera's projection
 * is shifted (setViewOffset) so its center sits in the middle of that area: every framing, click and
 * chip stays consistent, and opening a panel just slides the scene over instead of covering it.
 */

export interface FreeRect { left: number; top: number; right: number; bottom: number; w: number; h: number }

const MARGIN = 16;

/** The visible area not covered by HUD panels, in CSS pixels of the canvas. */
export function freeRect(width: number, height: number): FreeRect {
  const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
  const nav = box('.layernav');
  const inspector = box('.inspector');
  const feed = box('.livefeed');
  // The live feed docks on the right; with the inspector open it moves next to it, low on the screen:
  // then it only limits the area from below.
  const feedBelow = !!(feed && inspector);
  const left = (nav?.right ?? 0) + MARGIN;
  const right = Math.min(width, inspector?.left ?? width, feed && !feedBelow ? feed.left : width) - MARGIN;
  const top = (box('.topbar')?.bottom ?? 0) + MARGIN;
  const bottom = Math.min(height, box('.controls')?.top ?? height, feedBelow ? feed.top : height) - MARGIN;
  // Never let panels squeeze the scene into a sliver (tiny windows): fall back to the full canvas.
  if (right - left < width * 0.3 || bottom - top < height * 0.3) return { left: 0, top: 0, right: width, bottom: height, w: width, h: height };
  return { left, top, right, bottom, w: right - left, h: bottom - top };
}

/** How much farther the camera must sit so content framed for the full canvas fits the free area. */
export function fitScale(width: number, height: number) {
  const r = freeRect(width, height);
  return Math.max(width / r.w, height / r.h);
}

const projected = new Vector3();
const world = new Vector3();
const target = new Vector3();
const position = new Vector3();

const corner = new Vector3();

/** Screen-space size of the visible nodes (focused layer, or every layer), in CSS pixels. */
function contentExtent(camera: PerspectiveCamera, size: { width: number; height: number }, layout: TowerLayout, layerIds: string[]) {
  const focused = useStore.getState().focusedLayer;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  layerIds.forEach((id, i) => {
    if (focused !== undefined && i !== focused) return;
    const group = layerGroups.get(id);
    if (!group?.visible) return;
    for (const b of Object.values(layout.layers[i]?.nodes ?? {})) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corner.set(b.x + (dx * b.w) / 2, 0.2, b.z + (dz * b.d) / 2).applyMatrix4(group.matrixWorld).project(camera);
        const sx = ((corner.x + 1) / 2) * size.width;
        const sy = ((1 - corner.y) / 2) * size.height;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
    }
  });
  return x1 > x0 ? { w: x1 - x0, h: y1 - y0 } : undefined;
}

export function useHudFrame(controls: React.RefObject<CameraControls | null>, layout: TowerLayout, layerIds: string[]) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const selected = useStore((s) => s.selected);
  const feedOpen = useLive((s) => s.feedOpen);
  const scale = usePrefs((s) => s.uiScale);
  const goal = useRef({ x: 0, y: 0 });
  // Distance chosen by the user before panels forced a zoom-out (restored when they close).
  const autoBase = useRef<number>(undefined);
  const focusedLayer = useStore((st) => st.focusedLayer);
  const viewNonce = useStore((st) => st.viewNonce);
  const view = useStore((st) => st.view);
  useEffect(() => { autoBase.current = undefined; lastRect.current = ''; }, [focusedLayer, viewNonce, view]);
  const cur = useRef({ x: 0, y: 0 });
  // Free area at the last fit: selecting another node with the same panels open must not zoom.
  const lastRect = useRef('');

  // Panels open, close or resize: aim the projection center at the middle of the free area.
  useEffect(() => {
    const measure = (settled: boolean) => {
      const r = freeRect(size.width, size.height);
      goal.current = { x: size.width / 2 - (r.left + r.w / 2), y: size.height / 2 - (r.top + r.h / 2) };
      // Panels opened or closed: fit what is on screen (the focused layer, or the whole tower) into the
      // free area. Zoom out only when it no longer fits, and come back to the user's distance when it
      // fits again. Angle and target stay as the user left them. Only once panels finished sliding in.
      const ctl = controls.current;
      // Only a change of the free area (a panel opened or closed, the window resized) re-fits the zoom:
      // moving between nodes keeps the distance the user zoomed to.
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.w)},${Math.round(r.h)}`;
      const changed = settled && key !== lastRect.current;
      if (settled) lastRect.current = key;
      const ext = changed && ctl ? contentExtent(camera, size, layout, layerIds) : undefined;
      if (ctl && ext) {
        const need = Math.max(ext.w / (r.w * 0.94), ext.h / (r.h * 0.94));
        if (need > 1.03) {
          autoBase.current ??= ctl.distance;
          ctl.dollyTo(ctl.distance * need, true);
        } else if (autoBase.current !== undefined && need < 0.97) {
          const d = Math.max(autoBase.current, ctl.distance * need);
          ctl.dollyTo(d, true);
          if (d === autoBase.current) autoBase.current = undefined;
        }
      }
      keepAlive(600);
      invalidate();
    };
    // Panels mount (and slide in) after this render: measure once they are laid out.
    const t = [setTimeout(() => measure(false), 0), setTimeout(() => measure(true), 300)];
    return () => t.forEach(clearTimeout);
  }, [size.width, size.height, selected, feedOpen, scale, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 8);
    const c = cur.current;
    const g = goal.current;
    const v = camera.view;
    if (Math.abs(g.x - c.x) + Math.abs(g.y - c.y) < 0.5 && v?.enabled && v.offsetX === c.x && v.offsetY === c.y && v.fullWidth === size.width && v.fullHeight === size.height) return;
    c.x += (g.x - c.x) * k;
    c.y += (g.y - c.y) * k;
    if (Math.abs(g.x - c.x) + Math.abs(g.y - c.y) < 0.5) { c.x = g.x; c.y = g.y; }
    camera.setViewOffset(size.width, size.height, c.x, c.y, size.width, size.height);
    camera.updateProjectionMatrix();
    keepAlive(120);
  });

  // A node selected by keyboard (or from a list) that lands under a panel: bring it into view.
  useEffect(() => {
    const ctl = controls.current;
    if (!selected || !ctl) return;
    const t = setTimeout(() => {
      const layerId = selected.slice(0, selected.indexOf('.'));
      const group = layerGroups.get(layerId);
      const box = layout.layers[layerIds.indexOf(layerId)]?.nodes[selected];
      if (!group || !box) return;
      const r = freeRect(size.width, size.height);
      world.set(box.x, 0.2, box.z).applyMatrix4(group.matrixWorld);
      projected.copy(world).project(camera);
      const sx = ((projected.x + 1) / 2) * size.width;
      const sy = ((1 - projected.y) / 2) * size.height;
      const pad = 60;
      if (sx > r.left + pad && sx < r.right - pad && sy > r.top + pad && sy < r.bottom - pad) return;
      // Slide the camera (same angle and distance) just enough to bring the node inside the free area.
      const want = {
        x: Math.min(Math.max(sx, r.left + pad), r.right - pad) - sx,
        y: Math.min(Math.max(sy, r.top + pad), r.bottom - pad) - sy,
      };
      // Screen pixels per world unit along x and z at the node (a 2x2 Jacobian), then solve for the move.
      const px = (p: Vector3) => { p.project(camera); return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height }; };
      const ax = px(projected.copy(world).add(new Vector3(1, 0, 0)));
      const az = px(projected.copy(world).add(new Vector3(0, 0, 1)));
      const j = [[ax.x - sx, az.x - sx], [ax.y - sy, az.y - sy]];
      const det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
      if (Math.abs(det) < 1e-6) return;
      // Moving the camera by d moves the node on screen by -J·d.
      const dx = -(j[1][1] * want.x - j[0][1] * want.y) / det;
      const dz = -(-j[1][0] * want.x + j[0][0] * want.y) / det;
      ctl.getTarget(target);
      ctl.getPosition(position);
      ctl.setLookAt(position.x + dx, position.y, position.z + dz, target.x + dx, target.y, target.z + dz, true);
      keepAlive(1200);
    }, 350); // after the inspector has opened and the projection offset settled
    return () => clearTimeout(t);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
}
