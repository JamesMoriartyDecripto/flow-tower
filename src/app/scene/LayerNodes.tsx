import { useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Color, Quaternion, Vector3, type InstancedMesh } from 'three';
import type { ResolvedNode } from '../../core/types';
import type { NodeBox } from '../layout';
import { useStore } from '../store';
import { COLORS, FONTS, GLOW, HOT, NODE_STYLE, type Glyph } from '../theme';
import { opsMarks } from '../ops';
import { commit, fadeTo, GLYPHS, scaled, setInstance, toSegments, UNIT_BOX, WIRE_GLYPHS } from './batch';
import { TextBatch, type TextItem } from './TextBatch';

// Average glyph advance of the node fonts, in ems (measured on screen; the clipRect is the safety net).
const LABEL_EM = 0.5;
const TAG_EM = 0.66;

/** Truncates to the characters that fit `width` (with an ellipsis). */
function fit(text: string, width: number, charW: number) {
  const max = Math.floor(width / charW);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Joins subtitle parts in priority order, keeping only whole parts that fit. */
function fitParts(parts: (string | false | undefined)[], width: number, charW: number) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    const next = out ? `${out}  ·  ${p}` : p;
    if (next.length * charW > width) return out || fit(p, width, charW);
    out = next;
  }
  return out;
}

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
const rect = (b: NodeBox, y: number) => {
  const [x0, x1, z0, z1] = [b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2];
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new Vector3(x, y, z));
};

/** Every node of one layer, batched: a handful of draw calls regardless of node count. */
export function LayerNodes({ views, layer, layerFade, interactive, detail, tags: showTags }: {
  views: NodeView[]; layer: number; layerFade: number; interactive: boolean; detail: boolean; tags: boolean;
}) {
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
  // Fan-out nodes (×N parallel copies) show two ghost outlines stacked behind them.
  const ghosts = useMemo(() => toSegments(views.filter((v) => v.node.ops.fanout !== undefined).flatMap((v) => [1, 2].map((k) => {
    const o = 0.16 * k;
    const [x0, x1, z0, z1] = [v.box.x - v.box.w / 2 + o, v.box.x + v.box.w / 2 + o, v.box.z - v.box.d / 2 - o, v.box.z + v.box.d / 2 - o];
    return { points: [[x0, z0], [x1, z0], [x1, z1]].map(([x, z]) => new Vector3(x, TOP * 0.6, z)), color: scaled(GLOW.orange, v.fade * (0.7 - k * 0.2)) };
  }))), [views]);
  const pending = useMemo(() => toSegments(views.filter((v) => v.node.status !== 'active')
    .map((v) => ({ points: rect(v.box, TOP), color: scaled(v.node.status === 'deprecated' ? GLOW.white : GLOW.amber, v.fade * 0.8) }))), [views]);
  const active = views.filter((v) => v.selected || v.hovered);

  const labels = useMemo<TextItem[]>(() => views.map(({ node, box, fade }) => ({
    // Clipped at the node border (and before the sub-tower badge): long labels never spill out.
    text: fit(node.label, box.w - 0.95 - (node.tower ? 1.05 : 0.2), 0.4 * LABEL_EM), position: [box.x - box.w / 2 + 0.95, TOP + 0.01, box.z - 0.13], fontSize: 0.4,
    clip: box.w - 0.95 - (node.tower ? 1.05 : 0.2),
    color: COLORS.white, opacity: fade * layerFade * (node.status === 'deprecated' ? 0.55 : 1),
  })), [views, layerFade]);
  const tags = useMemo<TextItem[]>(() => views.map(({ node, box, fade }) => ({
    text: fitParts([
      node.tower && '⇣ SUB',
      node.status !== 'active' && node.status.toUpperCase(),
      NODE_STYLE[node.type].tag,
      ...opsMarks(node.ops),
      node.model?.replace(/^claude-/, ''),
      node.runtime && `@${node.runtime.id}`,
    ], box.w - 0.95 - 0.2, 0.2 * TAG_EM),
    position: [box.x - box.w / 2 + 0.95, TOP + 0.01, box.z + 0.34], fontSize: 0.2, letterSpacing: 0.06,
    clip: box.w - 0.95 - 0.2,
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
  const { hover, hoverLayer, select, enterTower } = useStore.getState();

  return (
    <group>
      <instancedMesh
        key={`p${views.length}`}
        ref={panels}
        args={[UNIT_BOX, undefined, views.length]}
        userData={{ nodes: true }}
        onPointerMove={guard((n) => { hoverLayer(layer); if (useStore.getState().hovered !== n.key) hover(n.key); })}
        onPointerOut={() => { if (interactive) { hover(undefined); hoverLayer(undefined); } }}
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
      {ghosts.points.length > 0 && (
        <Line points={ghosts.points} vertexColors={ghosts.colors} segments lineWidth={1} transparent opacity={layerFade} toneMapped={false} />
      )}
      {pending.points.length > 0 && (
        <Line points={pending.points} vertexColors={pending.colors} segments dashed dashSize={0.25} gapSize={0.18} lineWidth={1.4} transparent opacity={layerFade} toneMapped={false} />
      )}
      {active.map((v) => (
        <Line key={v.node.key} points={rect(v.box, TOP + 0.005)} color={v.selected ? HOT.white : HOT.amber} lineWidth={v.selected ? 2.8 : 2.2} transparent opacity={layerFade} toneMapped={false} />
      ))}

      {glyphs.map(([kind, items]) => <GlyphBatch key={kind} kind={kind} items={items} layerFade={layerFade} />)}
      {badges.length > 0 && <Badges items={badges} layerFade={layerFade} />}

      <group visible={detail}>
        <TextBatch items={labels} font={FONTS.ui} />
        {showTags && <TextBatch items={tags} font={FONTS.mono} />}
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
        // Bigger than before: the stacked plates are THE sign that a node opens its own tower.
        setInstance(mesh, i * 3 + k, [box.x + box.w / 2 - 0.5, TOP + 0.1 + k * 0.16, box.z - box.d / 2 + 0.45], [0.62 - k * 0.12, 0.05, 0.46 - k * 0.09]);
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
