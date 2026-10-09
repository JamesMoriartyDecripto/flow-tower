import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, CylinderGeometry, SphereGeometry, type InstancedMesh } from 'three';
import { targetKey } from '../../core/events';
import { liveState, strongest, subtreeState, useLive, type LiveState } from '../live';
import { GLOW, HOT, LAYER_GAP } from '../theme';
import { setInstance, UNIT_BOX } from './batch';
import { decorative, keepAlive } from './frameBudget';
import { useStore } from '../store';
import type { NodeView } from './LayerNodes';

const BEAM = new CylinderGeometry(0.06, 0.06, 1, 8, 1, true).translate(0, 0.5, 0);
const CAP = new SphereGeometry(0.2, 12, 8);
const COLOR: Record<LiveState, Color> = { run: GLOW.run, done: GLOW.done, error: GLOW.error, flash: HOT.white, idle: new Color(0, 0, 0) };
const tmp = new Color();

/**
 * Live activity on one layer, driven per frame from the live store (no React re-renders):
 * - a rim under the node (cyan running, green ripple when done, red on error, white flash),
 * - a light beam with a glowing cap, tall enough to be seen from the tower overview.
 * Nodes owning a sub-tower light up when anything inside that sub-tower is active.
 */
export function LiveOverlay({ tower, views, fade, subtrees, muted }: {
  tower: string; views: NodeView[]; fade: number; subtrees: Map<string, Set<string>>;
  /** Another layer is focused: stay a faint hint so nothing shines through the focused plate. */
  muted: boolean;
}) {
  const rim = useRef<InstancedMesh>(null);
  const beam = useRef<InstancedMesh>(null);
  const cap = useRef<InstancedMesh>(null);
  const panel = useRef<InstancedMesh>(null);
  const keys = useMemo(() => views.map((v) => targetKey(tower, v.node.key)), [tower, views]);
  const pulseOn = useStore((s) => decorative(s.quality, s.animations));

  useFrame(({ clock }) => {
    const meshes = [rim.current, beam.current, cap.current, panel.current];
    if (meshes.some((m) => !m)) return;
    const [r, b, c, p] = meshes as InstancedMesh[];
    const nodes = useLive.getState().nodes;
    const now = Date.now();
    const states = views.map(({ node }, i) => {
      const own = liveState(nodes.get(keys[i]), now);
      const sub = subtrees.get(node.key);
      return sub ? strongest([own, subtreeState(sub, nodes, now)]) : own;
    });
    const any = states.some((s) => s.state !== 'idle');
    // Transient flashes always need frames; the running pulse only when decorative motion is on
    // (eco shows a steady glow instead, so a long-running agent does not keep the GPU busy).
    if (states.some((s) => s.state === 'done' || s.state === 'flash' || s.state === 'error') || (pulseOn && any)) keepAlive(300);
    if (!any && !r.visible) return; // idle layer already hidden: no buffer writes
    const pulse = pulseOn ? 0.7 + 0.3 * Math.sin(clock.getElapsedTime() * 6) : 0.9;
    views.forEach(({ box }, i) => {
      const { state, level } = states[i];
      if (state === 'idle') {
        for (const m of [r, b, c, p]) { setInstance(m, i, [box.x, 0, box.z], [0, 0, 0]); m.setColorAt(i, COLOR.idle); }
        return;
      }
      const k = state === 'run' ? pulse : state === 'error' ? 0.6 + 0.4 * pulse : level;
      const color = tmp.copy(COLOR[state]).multiplyScalar(k);
      // Done = expanding ripple; run/error = steady rim; under the panel so labels stay readable.
      const grow = state === 'done' ? (1 - level) * 1.4 : 0.25;
      setInstance(r, i, [box.x, -0.05, box.z], [box.w + 0.4 + grow, 0.03, box.d + 0.4 + grow]);
      const h = state === 'run' || state === 'error' ? LAYER_GAP * 0.55 : LAYER_GAP * 0.35 * level;
      setInstance(b, i, [box.x, 0.2, box.z], [1, Math.max(h, 0.01), 1]);
      setInstance(c, i, [box.x, 0.2 + h, box.z], state === 'run' || state === 'error' ? [k, k, k] : [0, 0, 0]);
      // Re-light the node panel itself, so active nodes stay bright while the spotlight dims the rest.
      for (const m of [r, b, c]) m.setColorAt(i, color);
      setInstance(p, i, [box.x, 0.09, box.z], [box.w, 0.17, box.d]);
      p.setColorAt(i, color.multiplyScalar(0.35)); // last: mutates the shared temp color
    });
    for (const m of [r, b, c, p]) {
      m.visible = any;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  if (!views.length) return null;
  const opacity = muted ? fade * 0.5 : Math.max(fade, 0.35);
  const material = <meshBasicMaterial transparent opacity={0.85 * opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />;
  return (
    <group>
      <instancedMesh key={`r${views.length}`} ref={rim} args={[UNIT_BOX, undefined, views.length]} raycast={() => null} frustumCulled={false}>{material}</instancedMesh>
      <instancedMesh key={`b${views.length}`} ref={beam} args={[BEAM, undefined, views.length]} raycast={() => null} frustumCulled={false}>{material}</instancedMesh>
      <instancedMesh key={`c${views.length}`} ref={cap} args={[CAP, undefined, views.length]} raycast={() => null} frustumCulled={false}>{material}</instancedMesh>
      <instancedMesh key={`p${views.length}`} ref={panel} args={[UNIT_BOX, undefined, views.length]} raycast={() => null} frustumCulled={false}>{material}</instancedMesh>
    </group>
  );
}
