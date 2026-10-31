import { useLayoutEffect, useMemo, useRef } from 'react';
import { BatchLine } from './BatchLine';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { LineSegments2 } from 'three-stdlib';
import type { ResolvedEdge } from '../../core/types';
import type { TowerLayout } from '../layout';
import { useStore } from '../store';
import { usePrefs } from '../settings';
import { decorative } from './frameBudget';
import { EDGE_STYLE, GLOW, HOT } from '../theme';
import { scaled, toSegments } from './batch';
import type { LensState } from './lens';
import { linkFocusFade } from './linkFocus';
import { Particles, type ParticlePath } from './Particles';
import type { Visual } from './Layer';

interface Props {
  links: ResolvedEdge[];
  layout: TowerLayout;
  layerIndex: Record<string, number>;
  visual: Visual;
  layerFade: (index: number) => number;
  lens: LensState;
  /** Map view: seen from above, links cross everything; keep them faint unless highlighted. */
  quiet: boolean;
  /** Focus mode hides links that are not about the focused layer (#348). */
  focusedLayer: number | undefined;
}

const STEPS = 24;
const LIFT = 0.16;

/** Combined opacity of a curve: focus rule first, then the node fades of both endpoints. */
function curveFade(c: Curve, visual: Visual, layerFade: (index: number) => number, focusedLayer: number | undefined): number {
  return linkFocusFade(c.la, c.lb, focusedLayer, !!visual.edgeHighlight(c.link.id), layerFade)
    * Math.min(visual.nodeFade(c.link.from), visual.nodeFade(c.link.to));
}

interface Curve {
  link: ResolvedEdge;
  la: number;
  lb: number;
  a: { x: number; z: number };
  b: { x: number; z: number };
  /** Mutated in place every time the lens moves: lines and particles share these vectors. */
  points: Vector3[];
}

/**
 * Places a curve between two (possibly scaled, moved) layers. Tower: vertical S-bend between plates.
 * Map: both ends on the ground plane, so the curve arcs above the map instead.
 */
function place(c: Curve, lens: LensState) {
  const [sa, sb] = [lens.s[c.la], lens.s[c.lb]];
  const [ya, yb] = [lens.y[c.la] + LIFT * sa, lens.y[c.lb] + LIFT * sb];
  const [ax, az] = [c.a.x * sa + lens.x[c.la], c.a.z * sa + lens.z[c.la]];
  const [bx, bz] = [c.b.x * sb + lens.x[c.lb], c.b.z * sb + lens.z[c.lb]];
  const flat = Math.hypot(bx - ax, bz - az);
  const arc = Math.max(0, Math.min(flat * 0.22, 14) - Math.abs(yb - ya));
  const bend = (yb - ya) * 0.45;
  const [c1, c2] = [ya + bend + arc, yb - bend + arc];
  for (let k = 0; k <= STEPS; k++) {
    const t = k / STEPS;
    const u = 1 - t;
    // Cubic Bezier: x/z ease between the ends, y follows the bend (tower) or the arc (map).
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    c.points[k].set(
      ax * (w0 + w1) + bx * (w2 + w3),
      ya * w0 + c1 * w1 + c2 * w2 + yb * w3,
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
export function Links({ links, layout, layerIndex, visual, layerFade, lens, quiet, focusedLayer }: Props) {
  const particles = useStore((s) => s.particles);
  const flow = usePrefs((s) => s.flowLayers);
  const visible = usePrefs((s) => s.show.links);
  const deco = useStore((s) => decorative(s.quality, s.animations));

  const curves = useMemo(() => links.flatMap((l): Curve[] => {
    const [la, lb] = [layerIndex[l.from.split('.')[0]], layerIndex[l.to.split('.')[0]]];
    const a = layout.layers[la]?.nodes[l.from];
    const b = layout.layers[lb]?.nodes[l.to];
    if (!a || !b) return [];
    const c = { link: l, la, lb, a, b, points: Array.from({ length: STEPS + 1 }, () => new Vector3()) };
    place(c, lens);
    return [c];
  }), [links, layout, layerIndex, lens]);

  // Curves hidden by focus mode or by a zero fade are dropped up front, so they cost no segments.
  const shown = useMemo(
    () => curves
      .map((c) => ({ c, fade: curveFade(c, visual, layerFade, focusedLayer) }))
      .filter((s) => s.fade > 0),
    [curves, visual, layerFade, focusedLayer],
  );

  const batches = useMemo(() => {
    const group = (dashed: boolean) => toSegments(shown
      .filter(({ c }) => EDGE_STYLE[c.link.kind].dashed === dashed && !visual.edgeHighlight(c.link.id))
      .map(({ c, fade }) => ({ points: c.points, color: scaled(GLOW.white, (quiet ? 0.12 : 0.32) * fade) })));
    const hot = toSegments(shown
      .filter(({ c }) => visual.edgeHighlight(c.link.id))
      .map(({ c, fade }) => ({ points: c.points, color: scaled(HOT.orange, fade) })));
    return { solid: group(false), dashed: group(true), hot };
  }, [shown, visual, quiet]);

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

  // Particles follow the same visibility in focus mode; without focus they keep every curve as before.
  const paths = useMemo<ParticlePath[]>(
    () => (focusedLayer === undefined ? curves : shown.map((s) => s.c))
      .map((c) => ({ points: c.points, color: EDGE_STYLE[c.link.kind].color, count: 1 })),
    [curves, shown, focusedLayer],
  );

  return (
    <group visible={visible}>
      {batches.solid.points.length > 0 && (
        <BatchLine ref={refs.solid} points={batches.solid.points} vertexColors={batches.solid.colors} lineWidth={1} toneMapped={false} />
      )}
      {batches.dashed.points.length > 0 && (
        <BatchLine ref={refs.dashed} points={batches.dashed.points} vertexColors={batches.dashed.colors} dashed dashSize={0.4} gapSize={0.25} lineWidth={1} toneMapped={false} />
      )}
      {batches.hot.points.length > 0 && (
        <BatchLine ref={refs.hot} points={batches.hot.points} vertexColors={batches.hot.colors} lineWidth={2.2} toneMapped={false} />
      )}
      {particles && deco && flow.on && <Particles paths={paths} size={0.06} look={flow} />}
    </group>
  );
}
