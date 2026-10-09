import { useLayoutEffect, useMemo, useRef } from 'react';
import { Quaternion, Vector3, type InstancedMesh } from 'three';
import { EDGE_KINDS } from '../../core/schema';
import { edgeText, type EdgePath } from '../layout';
import { COLORS, EDGE_STYLE, FONTS, HOT } from '../theme';
import { BatchLine } from './BatchLine';
import { commit, CONE, scaled, setInstance, toSegments } from './batch';
import { TextBatch, type TextItem } from './TextBatch';

export interface EdgeView { edge: EdgePath; fade: number; highlight: boolean }

const Y = 0.05;
const UP = new Vector3(0, 1, 0);

/** All edges of one layer: one line batch per edge kind, instanced arrowheads, batched labels. */
export function LayerEdges({ views, layerFade, detail, labels: showLabels }: { views: EdgeView[]; layerFade: number; detail: boolean; labels: boolean }) {
  const lines = useMemo(() => views.map((v) => ({ ...v, points: v.edge.points.map(([x, z]) => new Vector3(x, Y, z)) })), [views]);

  const byKind = useMemo(() => EDGE_KINDS.map((kind) => {
    const style = EDGE_STYLE[kind];
    const seg = toSegments(lines.filter((l) => l.edge.kind === kind).map((l) => ({ points: l.points, color: scaled(style.color, l.fade * (l.highlight ? 1.4 : 0.75)) })));
    return { kind, style, ...seg };
  }).filter((k) => k.points.length), [lines]);

  const hot = useMemo(() => toSegments(lines.filter((l) => l.highlight).map((l) => ({ points: l.points, color: HOT.amber }))), [lines]);

  const arrows = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = arrows.current;
    if (!mesh) return;
    lines.forEach((l, i) => {
      const end = l.points[l.points.length - 1];
      const dir = end.clone().sub(l.points[l.points.length - 2]).normalize();
      const pos = end.clone().addScaledVector(dir, -0.14);
      setInstance(mesh, i, [pos.x, pos.y, pos.z], undefined, new Quaternion().setFromUnitVectors(UP, dir));
      mesh.setColorAt(i, scaled(EDGE_STYLE[l.edge.kind].color, l.fade * (l.highlight ? 1.3 : 0.8)));
    });
    commit(mesh);
  }, [lines]);

  const labels = useMemo<TextItem[]>(() => lines.flatMap((l) => {
    const text = edgeText(l.edge);
    if (!text) return [];
    let best = 0;
    let at = l.points[0];
    for (let i = 1; i < l.points.length; i++) {
      const len = l.points[i].distanceTo(l.points[i - 1]);
      if (len > best) { best = len; at = l.points[i].clone().add(l.points[i - 1]).multiplyScalar(0.5); }
    }
    return [{ text, position: [at.x, Y + 0.02, at.z - 0.2], fontSize: 0.22, anchorX: 'center', color: COLORS.amber, opacity: l.fade * layerFade }];
  }), [lines, layerFade]);

  return (
    <group>
      {byKind.map(({ kind, style, points, colors }) => (
        <BatchLine
          key={kind}
          points={points}
          vertexColors={colors}
          lineWidth={style.width}
          dashed={style.dashed}
          dashSize={0.32}
          gapSize={0.2}
          transparent
          opacity={layerFade}
          toneMapped={false}
        />
      ))}
      {hot.points.length > 0 && (
        <BatchLine points={hot.points} vertexColors={hot.colors} lineWidth={3.2} transparent opacity={0.55 * layerFade} toneMapped={false} />
      )}
      {lines.length > 0 && (
        <instancedMesh key={lines.length} ref={arrows} args={[CONE, undefined, lines.length]} raycast={() => null}>
          <meshBasicMaterial transparent opacity={layerFade} toneMapped={false} />
        </instancedMesh>
      )}
      {detail && showLabels && labels.length > 0 && <TextBatch items={labels} font={FONTS.mono} outline={COLORS.bg} />}
    </group>
  );
}
