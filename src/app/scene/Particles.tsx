import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, Vector3, type InstancedMesh } from 'three';

export interface ParticlePath {
  points: Vector3[];
  color: Color;
  /** Particles per path (before density). */
  count: number;
}

/** dots: round beads · comets: elongated streaks oriented along the flow · pulses: beads that breathe. */
export type FlowStyle = 'dots' | 'comets' | 'pulses';

export interface FlowLook {
  style: FlowStyle;
  /** Size multiplier (1 = default). */
  size: number;
  /** Speed multiplier (1 = 2.2 world units per second). */
  speed: number;
  /** Density multiplier on the per-path particle count. */
  density: number;
}

const dummy = new Object3D();
const BASE_SPEED = 2.2;
const ahead = new Vector3();

/** Glowing particles travelling along polylines: shows direction and "liveness" of every flow. */
export function Particles({ paths, size = 0.075, look }: { paths: ParticlePath[]; size?: number; look: FlowLook }) {
  const ref = useRef<InstancedMesh>(null);
  const tracks = useMemo(() => paths.flatMap((p) => {
    const cum = [0];
    for (let i = 1; i < p.points.length; i++) cum.push(cum[i - 1] + p.points[i].distanceTo(p.points[i - 1]));
    const len = cum[cum.length - 1] || 1;
    const count = Math.max(1, Math.round(p.count * look.density));
    return Array.from({ length: count }, (_, k) => ({ points: p.points, cum, len, color: p.color, offset: k / count }));
  }), [paths, look.density]);

  useLayoutEffect(() => {
    tracks.forEach((t, i) => ref.current?.setColorAt(i, t.color));
    if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [tracks]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = clock.getElapsedTime();
    const r = size * look.size;
    tracks.forEach((t, i) => {
      const d = (((time * BASE_SPEED * look.speed) / t.len + t.offset) % 1) * t.len;
      let s = 1;
      while (s < t.cum.length - 1 && t.cum[s] < d) s++;
      const a = t.points[s - 1];
      const b = t.points[s];
      const seg = t.cum[s] - t.cum[s - 1] || 1;
      dummy.position.copy(a).lerp(b, (d - t.cum[s - 1]) / seg);
      dummy.rotation.set(0, 0, 0);
      if (look.style === 'comets') {
        // Stretch along the direction of travel.
        dummy.lookAt(ahead.copy(b).sub(a).add(dummy.position));
        dummy.scale.set(r, r, r * 4);
      } else if (look.style === 'pulses') {
        dummy.scale.setScalar(r * (0.7 + 0.6 * (0.5 + 0.5 * Math.sin(time * 6 + i))));
      } else {
        dummy.scale.setScalar(r);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!tracks.length) return null;
  return (
    <instancedMesh key={tracks.length} ref={ref} args={[undefined, undefined, tracks.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
