import { useMemo, useRef } from 'react';
import { Grid, Line, Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { COLORS, GLOW } from '../theme';

const circle = (r: number, seg = 96): [number, number, number][] =>
  Array.from({ length: seg + 1 }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  });

/** Arc-reactor style base under the tower: concentric rings and rotating tick marks. */
export function Base({ radius, y, dim }: { radius: number; y: number; dim: boolean }) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  useFrame((_, dt) => {
    if (outer.current) outer.current.rotation.y += dt * 0.08;
    if (inner.current) inner.current.rotation.y -= dt * 0.15;
  });
  const ticks = useMemo(() => Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2;
    const r2 = radius * (i % 6 === 0 ? 1.08 : 1.04);
    return [[Math.cos(a) * radius, 0, Math.sin(a) * radius], [Math.cos(a) * r2, 0, Math.sin(a) * r2]] as [number, number, number][];
  }).flat(), [radius]);
  const arcs = useMemo(() => [0, 1, 2].map((k) => circle(radius * 0.8, 96).slice(k * 32, k * 32 + 22)), [radius]);

  const k = dim ? 0.25 : 1;
  return (
    <group position-y={y}>
      <Line points={circle(radius)} color={GLOW.orange} lineWidth={1.4} transparent opacity={0.6 * k} toneMapped={false} />
      <Line points={circle(radius * 1.12)} color={GLOW.white} lineWidth={0.8} transparent opacity={0.25 * k} toneMapped={false} />
      <group ref={outer}>
        <Line points={ticks} segments color={GLOW.orange} lineWidth={1} transparent opacity={0.5 * k} toneMapped={false} />
      </group>
      <group ref={inner}>
        {arcs.map((a, i) => <Line key={i} points={a} color={GLOW.amber} lineWidth={2.4} transparent opacity={0.55 * k} toneMapped={false} />)}
      </group>
      <Grid
        position-y={-0.02}
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        cellColor="#10264a"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#1d3d6e"
        fadeDistance={radius * 6}
        fadeStrength={2}
      />
    </group>
  );
}

/** A horizontal scan frame sweeping up and down the tower. */
export function Scanner({ width, depth, top, bottom }: { width: number; depth: number; top: number; bottom: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (Math.sin(clock.getElapsedTime() * 0.35) + 1) / 2;
    ref.current.position.y = bottom + (top - bottom) * t;
  });
  const [x, z] = [width / 2 + 0.6, depth / 2 + 0.6];
  return (
    <group ref={ref}>
      <Line
        points={[[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, 0, -z]]}
        color={GLOW.amber}
        lineWidth={1}
        dashed
        dashSize={0.5}
        gapSize={0.35}
        transparent
        opacity={0.22}
        toneMapped={false}
      />
    </group>
  );
}

export function Ambient({ size }: { size: [number, number, number] }) {
  return (
    <>
      <color attach="background" args={[COLORS.bg]} />
      <fog attach="fog" args={[COLORS.bg, size[0] * 1.6, size[0] * 4.5]} />
      <Sparkles count={140} scale={size} size={2.2} speed={0.25} opacity={0.5} color={COLORS.amber} />
    </>
  );
}
