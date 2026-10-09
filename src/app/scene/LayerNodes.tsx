import { useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Color, Quaternion, Vector3, type InstancedMesh } from 'three';
import type { ResolvedNode } from '../../core/types';
import type { NodeBox } from '../layout';
import { useStore } from '../store';
import { COLORS, FONTS, GLOW, NODE_STYLE, type Glyph } from '../theme';
import { commit, fadeTo, GLYPHS, scaled, setInstance, toSegments, UNIT_BOX, WIRE_GLYPHS } from './batch';
import { TextBatch, type TextItem } from './TextBatch';

export interface NodeView {
  node: ResolvedNode;
  box: NodeBox;
  fade: number;
  selected: boolean;
  hovered: boolean;
}

const TOP = 0.16;
const PANEL = new Color('#0c2650');
const PANEL_ACTIVE = new Color('#1a4680');
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const rect = (b: NodeBox, y: number) => {
  const [x0, x1, z0, z1] = [b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2];
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new Vector3(x, y, z));
};

/** Every node of one layer, batched: a handful of draw calls regardless of node count. */
export function LayerNodes({ views, layerFade, interactive, detail }: { views: NodeView[]; layerFade: number; interactive: boolean; detail: boolean }) {
  const panels = useRef<InstancedMesh>(null);
  const accents = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const [pm, am] = [panels.current, accents.current];
    if (!pm || !am) return;
    views.forEach(({ box, fade, selected, hovered }, i) => {
      setInstance(pm, i, [box.x, TOP / 2, box.z], [box.w, TOP, box.d]);
      pm.setColorAt(i, fadeTo(selected || hovered ? PANEL_ACTIVE : PANEL, fade));
      setInstance(am, i, [box.x - box.w / 2 + 0.05, TOP + 0.01, box.z], [0.1, 0.02, box.d - 0.2]);
      am.setColorAt(i, scaled(GLOW.orange, fade));
    });
    commit(pm);
    commit(am);
  }, [views]);

  // Non-active nodes (planned / experimental / deprecated) get a dashed outline in their own batch.
  const outline = useMemo(() => toSegments(views.filter((v) => v.node.status === 'active')
    .map((v) => ({ points: rect(v.box, TOP), color: scaled(GLOW.orange, v.fade) }))), [views]);
  const pending = useMemo(() => toSegments(views.filter((v) => v.node.status !== 'active')
    .map((v) => ({ points: rect(v.box, TOP), color: scaled(v.node.status === 'deprecated' ? GLOW.white : GLOW.amber, v.fade * 0.8) }))), [views]);
  const active = views.filter((v) => v.selected || v.hovered);

  const labels = useMemo<TextItem[]>(() => views.map(({ node, box, fade }) => ({
    text: short(node.label, 21), position: [box.x - box.w / 2 + 0.95, TOP + 0.01, box.z - 0.13], fontSize: 0.4,
    color: COLORS.white, opacity: fade * layerFade * (node.status === 'deprecated' ? 0.55 : 1),
  })), [views, layerFade]);
  const tags = useMemo<TextItem[]>(() => views.map(({ node, box, fade }) => ({
    text: [
      node.status !== 'active' && node.status.toUpperCase(),
      NODE_STYLE[node.type].tag,
      node.model?.replace(/^claude-/, ''),
      node.runtime && `@${short(node.runtime.id, 14)}`,
    ].filter(Boolean).join('  ·  '),
    position: [box.x - box.w / 2 + 0.95, TOP + 0.01, box.z + 0.34], fontSize: 0.2, letterSpacing: 0.06,
    color: COLORS.amber, opacity: 0.85 * fade * layerFade,
  })), [views, layerFade]);

  const glyphs = useMemo(() => {
    const by = new Map<Glyph, NodeView[]>();
    for (const v of views) {
      const g = NODE_STYLE[v.node.type].glyph;
      by.set(g, [...(by.get(g) ?? []), v]);
    }
    return [...by.entries()];
  }, [views]);
  const badges = views.filter((v) => v.node.tower);

  const pick = (id?: number) => (id === undefined ? undefined : views[id]?.node);
  const guard = <E extends PointerEvent | MouseEvent>(fn: (n: ResolvedNode) => void) => (e: ThreeEvent<E>) => {
    if (!interactive) return;
    const n = pick(e.instanceId);
    if (!n) return;
    e.stopPropagation();
    fn(n);
  };
  const { hover, select, enterTower } = useStore.getState();

  return (
    <group>
      <instancedMesh
        key={`p${views.length}`}
        ref={panels}
        args={[UNIT_BOX, undefined, views.length]}
        onPointerMove={guard((n) => useStore.getState().hovered !== n.key && hover(n.key))}
        onPointerOut={() => interactive && hover(undefined)}
        onClick={guard((n) => select(n.key))}
        onDoubleClick={guard((n) => n.tower && enterTower(n.tower))}
      >
        <meshBasicMaterial transparent opacity={0.88 * layerFade} depthWrite={false} />
      </instancedMesh>
      <instancedMesh key={`a${views.length}`} ref={accents} args={[UNIT_BOX, undefined, views.length]} raycast={() => null}>
        <meshBasicMaterial transparent opacity={layerFade} toneMapped={false} />
      </instancedMesh>

      {outline.points.length > 0 && (
        <Line points={outline.points} vertexColors={outline.colors} segments lineWidth={1.2} transparent opacity={layerFade} toneMapped={false} />
      )}
      {pending.points.length > 0 && (
        <Line points={pending.points} vertexColors={pending.colors} segments dashed dashSize={0.25} gapSize={0.18} lineWidth={1.4} transparent opacity={layerFade} toneMapped={false} />
      )}
      {active.map((v) => (
        <Line key={v.node.key} points={rect(v.box, TOP + 0.005)} color={v.selected ? GLOW.white : GLOW.amber} lineWidth={v.selected ? 2.8 : 2.2} transparent opacity={layerFade} toneMapped={false} />
      ))}

      {glyphs.map(([kind, items]) => <GlyphBatch key={kind} kind={kind} items={items} layerFade={layerFade} />)}
      {badges.length > 0 && <Badges items={badges} layerFade={layerFade} />}

      <group visible={detail}>
        <TextBatch items={labels} font={FONTS.ui} />
        <TextBatch items={tags} font={FONTS.mono} />
      </group>
    </group>
  );
}

const SPIN = new Vector3(0, 1, 0);

function GlyphBatch({ kind, items, layerFade }: { kind: Glyph; items: NodeView[]; layerFade: number }) {
  const ref = useRef<InstancedMesh>(null);
  const angle = useRef(0);
  const q = useMemo(() => new Quaternion(), []);
  const spins = items.map((v) => v.node.type === 'agent' || v.selected || v.hovered);
  const place = (rot: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((v, i) => setInstance(mesh, i, [v.box.x - v.box.w / 2 + 0.5, 0.48, v.box.z], undefined, q.setFromAxisAngle(SPIN, spins[i] ? rot : 0)));
    mesh.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const base = WIRE_GLYPHS.has(kind) ? GLOW.white : GLOW.orange;
    items.forEach((v, i) => mesh.setColorAt(i, scaled(base, v.fade)));
    place(angle.current);
    commit(mesh);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    if (!spins.some(Boolean)) return;
    angle.current += dt * 0.9;
    place(angle.current);
  });

  return (
    <instancedMesh key={items.length} ref={ref} args={[GLYPHS[kind], undefined, items.length]} raycast={() => null}>
      <meshBasicMaterial wireframe={WIRE_GLYPHS.has(kind)} transparent opacity={layerFade} toneMapped={false} />
    </instancedMesh>
  );
}

/** Three stacked mini plates on nodes that contain their own tower. */
function Badges({ items, layerFade }: { items: NodeView[]; layerFade: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach(({ box, fade }, i) => {
      for (let k = 0; k < 3; k++) {
        setInstance(mesh, i * 3 + k, [box.x + box.w / 2 - 0.4, TOP + 0.08 + k * 0.11, box.z - box.d / 2 + 0.38], [0.42 - k * 0.08, 0.035, 0.32 - k * 0.06]);
        mesh.setColorAt(i * 3 + k, scaled(GLOW.amber, fade * (0.9 - k * 0.2)));
      }
    });
    commit(mesh);
  }, [items]);
  return (
    <instancedMesh key={items.length} ref={ref} args={[UNIT_BOX, undefined, items.length * 3]} raycast={() => null}>
      <meshBasicMaterial transparent opacity={layerFade} toneMapped={false} />
    </instancedMesh>
  );
}
