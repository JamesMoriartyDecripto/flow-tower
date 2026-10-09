import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { CubicBezierCurve3, Vector3 } from 'three';
import type { ResolvedEdge } from '../../core/types';
import type { TowerLayout } from '../layout';
import { useStore } from '../store';
import { EDGE_STYLE, GLOW, LAYER_GAP } from '../theme';
import { scaled, toSegments } from './batch';
import { Particles, type ParticlePath } from './Particles';
import type { Visual } from './Layer';

interface Props {
  links: ResolvedEdge[];
  layout: TowerLayout;
  layerIndex: Record<string, number>;
  visual: Visual;
  layerFade: (index: number) => number;
}

/**
 * Cross-layer edges drawn as vertical S-curves, batched into solid / dashed / highlighted lines.
 * Built at unit spacing: the parent group scales them on Y to follow the animated tower spacing.
 */
export function Links({ links, layout, layerIndex, visual, layerFade }: Props) {
  const particles = useStore((s) => s.particles);

  const curves = useMemo(() => links.flatMap((l) => {
    const [la, lb] = [layerIndex[l.from.split('.')[0]], layerIndex[l.to.split('.')[0]]];
    const a = layout.layers[la]?.nodes[l.from];
    const b = layout.layers[lb]?.nodes[l.to];
    if (!a || !b) return [];
    const p0 = new Vector3(a.x, -la * LAYER_GAP + 0.16, a.z);
    const p3 = new Vector3(b.x, -lb * LAYER_GAP + 0.16, b.z);
    const bend = (p3.y - p0.y) * 0.45;
    const curve = new CubicBezierCurve3(p0, p0.clone().setY(p0.y + bend), p3.clone().setY(p3.y - bend), p3);
    return [{ link: l, la, lb, points: curve.getPoints(24) }];
  }), [links, layout, layerIndex]);

  const batches = useMemo(() => {
    const fadeOf = (c: (typeof curves)[number]) =>
      Math.min(layerFade(c.la), layerFade(c.lb)) * Math.min(visual.nodeFade(c.link.from), visual.nodeFade(c.link.to));
    const group = (dashed: boolean) => toSegments(curves
      .filter((c) => EDGE_STYLE[c.link.kind].dashed === dashed && !visual.edgeHighlight(c.link.id))
      .map((c) => ({ points: c.points, color: scaled(GLOW.white, 0.32 * fadeOf(c)) })));
    const hot = toSegments(curves
      .filter((c) => visual.edgeHighlight(c.link.id))
      .map((c) => ({ points: c.points, color: scaled(GLOW.orange, fadeOf(c)) })));
    return { solid: group(false), dashed: group(true), hot };
  }, [curves, visual, layerFade]);

  const paths = useMemo<ParticlePath[]>(
    () => curves.map((c) => ({ points: c.points, color: EDGE_STYLE[c.link.kind].color, count: 1 })),
    [curves],
  );

  return (
    <group>
      {batches.solid.points.length > 0 && <Line points={batches.solid.points} vertexColors={batches.solid.colors} segments lineWidth={1} toneMapped={false} />}
      {batches.dashed.points.length > 0 && (
        <Line points={batches.dashed.points} vertexColors={batches.dashed.colors} segments dashed dashSize={0.4} gapSize={0.25} lineWidth={1} toneMapped={false} />
      )}
      {batches.hot.points.length > 0 && <Line points={batches.hot.points} vertexColors={batches.hot.colors} segments lineWidth={2.2} toneMapped={false} />}
      {particles && <Particles paths={paths} size={0.06} />}
    </group>
  );
}
