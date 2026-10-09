import { useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { LineSegments2 } from 'three-stdlib';
import type { ResolvedEdge } from '../../core/types';
import type { TowerLayout } from '../layout';
import { useStore } from '../store';
import { EDGE_STYLE, GLOW } from '../theme';
import { scaled, toSegments } from './batch';
import type { LensState } from './lens';
import { Particles, type ParticlePath } from './Particles';
import type { Visual } from './Layer';

interface Props {
  links: ResolvedEdge[];
  layout: TowerLayout;
  layerIndex: Record<string, number>;
  visual: Visual;
  layerFade: (index: number) => number;
  lens: LensState;
}

const STEPS = 24;
const LIFT = 0.16;

interface Curve {
  link: ResolvedEdge;
  la: number;
  lb: number;
  a: { x: number; z: number };
  b: { x: number; z: number };
  /** Mutated in place every time the lens moves: lines and particles share these vectors. */
  points: Vector3[];
}

/** Places a curve's points as a vertical S-bend between two (possibly scaled, shifted) layers. */
function place(c: Curve, lens: LensState) {
  const [sa, sb] = [lens.s[c.la], lens.s[c.lb]];
  const [ya, yb] = [lens.y[c.la] + LIFT * sa, lens.y[c.lb] + LIFT * sb];
  const [ax, az, bx, bz] = [c.a.x * sa, c.a.z * sa, c.b.x * sb, c.b.z * sb];
  const bend = (yb - ya) * 0.45;
  for (let k = 0; k <= STEPS; k++) {
    const t = k / STEPS;
    const u = 1 - t;
    // Cubic Bezier with control points straight above/below the endpoints.
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    c.points[k].set(
      ax * (w0 + w1) + bx * (w2 + w3),
      ya * w0 + (ya + bend) * w1 + (yb - bend) * w2 + yb * w3,
      az * (w0 + w1) + bz * (w2 + w3),
    );
  }
}

function flatten(points: Vector3[]): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => out.set([p.x, p.y, p.z], i * 3));
  return out;
}

/** Cross-layer edges, batched into solid / dashed / highlighted lines that follow the layer lens. */
export function Links({ links, layout, layerIndex, visual, layerFade, lens }: Props) {
  const particles = useStore((s) => s.particles);

  const curves = useMemo(() => links.flatMap((l): Curve[] => {
    const [la, lb] = [layerIndex[l.from.split('.')[0]], layerIndex[l.to.split('.')[0]]];
    const a = layout.layers[la]?.nodes[l.from];
    const b = layout.layers[lb]?.nodes[l.to];
    if (!a || !b) return [];
    const c = { link: l, la, lb, a, b, points: Array.from({ length: STEPS + 1 }, () => new Vector3()) };
    place(c, lens);
    return [c];
  }), [links, layout, layerIndex, lens]);

  const batches = useMemo(() => {
    const fadeOf = (c: Curve) =>
      Math.min(layerFade(c.la), layerFade(c.lb)) * Math.min(visual.nodeFade(c.link.from), visual.nodeFade(c.link.to));
    const group = (dashed: boolean) => toSegments(curves
      .filter((c) => EDGE_STYLE[c.link.kind].dashed === dashed && !visual.edgeHighlight(c.link.id))
      .map((c) => ({ points: c.points, color: scaled(GLOW.white, 0.32 * fadeOf(c)) })));
    const hot = toSegments(curves
      .filter((c) => visual.edgeHighlight(c.link.id))
      .map((c) => ({ points: c.points, color: scaled(GLOW.orange, fadeOf(c)) })));
    return { solid: group(false), dashed: group(true), hot };
  }, [curves, visual, layerFade]);

  // Imperative updates: when the lens animates, move the existing geometry instead of re-rendering.
  const refs = { solid: useRef<LineSegments2>(null), dashed: useRef<LineSegments2>(null), hot: useRef<LineSegments2>(null) };
  const seen = useRef(-1);
  useLayoutEffect(() => { seen.current = -1; }, [batches]);
  useFrame(() => {
    if (seen.current === lens.version) return;
    seen.current = lens.version;
    for (const c of curves) place(c, lens);
    for (const key of ['solid', 'dashed', 'hot'] as const) {
      const line = refs[key].current;
      if (!line || !batches[key].points.length) continue;
      line.geometry.setPositions(flatten(batches[key].points));
      if (key === 'dashed') line.computeLineDistances();
    }
  });

  const paths = useMemo<ParticlePath[]>(
    () => curves.map((c) => ({ points: c.points, color: EDGE_STYLE[c.link.kind].color, count: 1 })),
    [curves],
  );

  return (
    <group>
      {batches.solid.points.length > 0 && (
        <Line ref={refs.solid} points={batches.solid.points} vertexColors={batches.solid.colors} segments lineWidth={1} toneMapped={false} />
      )}
      {batches.dashed.points.length > 0 && (
        <Line ref={refs.dashed} points={batches.dashed.points} vertexColors={batches.dashed.colors} segments dashed dashSize={0.4} gapSize={0.25} lineWidth={1} toneMapped={false} />
      )}
      {batches.hot.points.length > 0 && (
        <Line ref={refs.hot} points={batches.hot.points} vertexColors={batches.hot.colors} segments lineWidth={2.2} toneMapped={false} />
      )}
      {particles && <Particles paths={paths} size={0.06} />}
    </group>
  );
}
