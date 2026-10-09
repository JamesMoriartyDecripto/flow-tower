import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, CylinderGeometry, type InstancedMesh } from 'three';
import { targetKey } from '../../core/events';
import { activity, useLive } from '../live';
import { GLOW } from '../theme';
import { setInstance, UNIT_BOX } from './batch';
import type { NodeView } from './LayerNodes';

const BEAM = new CylinderGeometry(0.05, 0.05, 1, 8, 1, true).translate(0, 0.5, 0);
const ERROR = new Color('#ff5a4f').multiplyScalar(2.2);
const OFF = new Color(0, 0, 0);
const tmp = new Color();

/**
 * Live activity on one layer: a halo under active nodes plus a light beam above them, so a working
 * agent is visible even from the tower overview. Driven per frame from the live store (no re-renders).
 */
export function LiveOverlay({ tower, views, fade }: { tower: string; views: NodeView[]; fade: number }) {
  const halo = useRef<InstancedMesh>(null);
  const beam = useRef<InstancedMesh>(null);
  const keys = useMemo(() => views.map((v) => targetKey(tower, v.node.key)), [tower, views]);

  useFrame(({ clock }) => {
    const [h, b] = [halo.current, beam.current];
    if (!h || !b) return;
    const nodes = useLive.getState().nodes;
    if (!nodes.size) { h.visible = b.visible = false; return; }
    const now = Date.now();
    // Idle layer that is already hidden: skip all buffer writes.
    if (!h.visible && keys.every((k) => { const a = activity(nodes.get(k), now); return a.level <= 0.01 && !a.error; })) return;
    const pulse = 0.75 + 0.25 * Math.sin(clock.getElapsedTime() * 5);
    let any = false;
    views.forEach(({ box }, i) => {
      const a = activity(nodes.get(keys[i]), now);
      const level = a.active ? a.level * pulse : a.level;
      if (level <= 0.01 && !a.error) {
        setInstance(h, i, [box.x, 0, box.z], [0, 0, 0]);
        setInstance(b, i, [box.x, 0, box.z], [0, 0, 0]);
        h.setColorAt(i, OFF);
        b.setColorAt(i, OFF);
        return;
      }
      any = true;
      const color = tmp.copy(a.error ? ERROR : a.active ? GLOW.amber : GLOW.white).multiplyScalar(Math.max(level, a.error ? 0.8 : 0));
      // Under the node panel: reads as a glowing rim and never covers the label.
      setInstance(h, i, [box.x, -0.05, box.z], [box.w + 0.35 + 0.4 * level, 0.02, box.d + 0.35 + 0.4 * level]);
      setInstance(b, i, [box.x, 0.2, box.z], [1 + level, 1.5 + 4 * level, 1 + level]);
      h.setColorAt(i, color);
      b.setColorAt(i, color);
    });
    h.visible = b.visible = any;
    for (const m of [h, b]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  if (!views.length) return null;
  return (
    <group>
      <instancedMesh key={`h${views.length}`} ref={halo} args={[UNIT_BOX, undefined, views.length]} raycast={() => null} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.7 * Math.max(fade, 0.3)} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`b${views.length}`} ref={beam} args={[BEAM, undefined, views.length]} raycast={() => null} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.6 * Math.max(fade, 0.3)} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
