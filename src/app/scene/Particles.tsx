import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type InstancedMesh, type Vector3 } from 'three';

export interface ParticlePath {
  points: Vector3[];
  color: Color;
  /** Particles per path. */
  count: number;
}

const dummy = new Object3D();
const SPEED = 2.2; // world units per second

/** Glowing dots travelling along polylines: shows direction and "liveness" of every flow. */
export function Particles({ paths, size = 0.075 }: { paths: ParticlePath[]; size?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const tracks = useMemo(() => paths.flatMap((p) => {
    const cum = [0];
    for (let i = 1; i < p.points.length; i++) cum.push(cum[i - 1] + p.points[i].distanceTo(p.points[i - 1]));
    const len = cum[cum.length - 1] || 1;
    return Array.from({ length: p.count }, (_, k) => ({ points: p.points, cum, len, color: p.color, offset: k / p.count }));
  }), [paths]);

  useLayoutEffect(() => {
    tracks.forEach((t, i) => ref.current?.setColorAt(i, t.color));
    if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [tracks]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = clock.getElapsedTime();
    tracks.forEach((t, i) => {
      const d = (((time * SPEED) / t.len + t.offset) % 1) * t.len;
      let s = 1;
      while (s < t.cum.length - 1 && t.cum[s] < d) s++;
      const a = t.points[s - 1];
      const b = t.points[s];
      const seg = t.cum[s] - t.cum[s - 1] || 1;
      dummy.position.copy(a).lerp(b, (d - t.cum[s - 1]) / seg);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!tracks.length) return null;
  return (
    <instancedMesh key={tracks.length} ref={ref} args={[undefined, undefined, tracks.length]} frustumCulled={false}>
      <sphereGeometry args={[size, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
