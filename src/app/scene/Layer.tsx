import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Billboard, Line, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Vector3, type Group, type PerspectiveCamera } from 'three';
import type { ResolvedLayer } from '../../core/types';
import type { LayerLayout } from '../layout';
import { useStore } from '../store';
import { decorative } from './frameBudget';
import { COLORS, EDGE_STYLE, FONTS, GLOW, HOT } from '../theme';
import type { LensState } from './lens';
import { LayerEdges, type EdgeView } from './LayerEdges';
import { LayerNodes, type NodeView } from './LayerNodes';
import { LiveOverlay } from './LiveOverlay';
import { layerGroups } from './chips';
import { Particles, type ParticlePath } from './Particles';

export interface Visual {
  nodeFade(key: string): number;
  edgeHighlight(id: string): boolean | undefined;
  selected?: string;
  hovered?: string;
}

interface Props {
  tower: string;
  layer: ResolvedLayer;
  layout: LayerLayout;
  width: number;
  depth: number;
  lens: LensState;
  fade: number;
  interactive: boolean;
  visual: Visual;
  liveTint?: 'run' | 'error';
  /** The focused layer: near-opaque plate so whatever lies below stops competing for attention. */
  focused: boolean;
  /** Map view: bigger titles above each section's corner, readable from high above. */
  mapView: boolean;
  subtrees: Map<string, Set<string>>;
}

/** A glass plate holding one left-to-right flowchart. Height and scale follow the animated lens. */
export const Layer = memo(function Layer({ tower, layer, layout, width, depth, lens, fade, interactive, visual, liveTint, subtrees, focused, mapView }: Props) {
  const ref = useRef<Group>(null);
  useEffect(() => {
    const g = ref.current;
    if (g) layerGroups.set(layer.id, g);
    return () => { if (layerGroups.get(layer.id) === g) layerGroups.delete(layer.id); };
  }, [layer.id]);
  const particles = useStore((s) => s.particles);
  const deco = useStore((s) => decorative(s.quality, s.animations));
  const focusLayer = useStore((s) => s.focusLayer);
  const hoverLayer = useStore((s) => s.hoverLayer);

  // Plates are see-through: a node visible behind a plate wins, and only the nearest plate reacts.
  const ownsEvent = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!interactive || e.intersections.some((h) => h.object.userData.nodes)) return false;
    return e.intersections.find((h) => h.object.userData.plate !== undefined)?.object.userData.plate === layer.index;
  };

  // Text LOD: node labels are only drawn when they would be readable (≈ 4.5px+ tall).
  const [detail, setDetail] = useState(true);
  const center = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    if (!ref.current) return;
    ref.current.position.set(lens.x[layer.index], lens.y[layer.index], lens.z[layer.index]);
    ref.current.scale.setScalar(lens.s[layer.index]);
    ref.current.getWorldPosition(center);
    const fov = ((camera as PerspectiveCamera).fov ?? 42) * (Math.PI / 180);
    const px = (0.4 * size.height) / (2 * Math.tan(fov / 2) * camera.position.distanceTo(center));
    const next = detail ? px > 3.8 : px > 4.6;
    if (next !== detail) setDetail(next);
  });

  const grid = useMemo(() => gridGeometry(width, depth, 1), [width, depth]);
  const outline = useMemo(() => {
    const [x, z] = [width / 2, depth / 2];
    return [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, 0, -z]] as [number, number, number][];
  }, [width, depth]);
  const brackets = useMemo(() => cornerBrackets(width, depth, 1.4), [width, depth]);

  const paths = useMemo<ParticlePath[]>(() => layout.edges.map((e) => ({
    points: e.points.map(([x, z]) => new Vector3(x, 0.09, z)),
    color: EDGE_STYLE[e.kind].color,
    count: 2,
  })), [layout.edges]);

  const idx = String(layer.index + 1).padStart(2, '0');
  const layerLive = liveTint;
  const { nodeFade, edgeHighlight, selected, hovered } = visual;
  const nodeViews = useMemo<NodeView[]>(() => layer.nodes.filter((n) => layout.nodes[n.key]).map((n) => ({
    node: n, box: layout.nodes[n.key], fade: nodeFade(n.key), selected: selected === n.key, hovered: hovered === n.key,
  })), [layer, layout, nodeFade, selected, hovered]);
  const edgeViews = useMemo<EdgeView[]>(() => layout.edges.map((e) => ({
    edge: e, fade: Math.min(nodeFade(e.from), nodeFade(e.to)), highlight: !!edgeHighlight(e.id),
  })), [layout, nodeFade, edgeHighlight]);

  return (
    <group ref={ref} visible={fade > 0.05}>
      <mesh
        position-y={-0.04}
        renderOrder={-1}
        userData={{ plate: layer.index }}
        onPointerMove={(e) => ownsEvent(e) && hoverLayer(layer.index)}
        onPointerOut={() => hoverLayer(undefined)}
        onClick={(e) => {
          if (!ownsEvent(e)) return;
          e.stopPropagation();
          useStore.getState().select(undefined);
          focusLayer(layer.index);
        }}
      >
        <boxGeometry args={[width, 0.06, depth]} />
        <meshBasicMaterial color={focused ? COLORS.bg : COLORS.plate} transparent opacity={focused ? 0.9 : 0.42 * fade} depthWrite={false} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={COLORS.dim} transparent opacity={(focused ? 0.06 : 0.09) * fade} depthWrite={false} />
      </lineSegments>
      <Line points={outline} color={layerLive === 'error' ? GLOW.error : layerLive === 'run' ? GLOW.run : focused ? HOT.orange : GLOW.orange}
        lineWidth={layerLive || focused ? 2 : 1} transparent opacity={(layerLive || focused ? 0.9 : 0.55) * fade} toneMapped={false} />
      <Line points={brackets} segments color={GLOW.white} lineWidth={2.2} transparent opacity={0.9 * fade} toneMapped={false} />

      <Billboard position={mapView ? [-width / 2, 1.2, -depth / 2 - 1.6] : [-width / 2 - 0.6, 0.6, depth / 2]} scale={mapView ? 3 : 1}>
        <group
          onClick={(e) => { if (!interactive) return; e.stopPropagation(); focusLayer(layer.index); }}
          onPointerOver={(e) => { if (interactive) { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        >
          <Text font={FONTS.display} fontSize={0.9} anchorX="right" anchorY="bottom" color={GLOW.orange} fillOpacity={fade} letterSpacing={0.05}>
            {`L${idx}`}
          </Text>
          <Text font={FONTS.ui} fontSize={0.5} anchorX="right" anchorY="top" position-y={-0.08} color={COLORS.white} fillOpacity={fade} letterSpacing={0.08}>
            {layer.title.toUpperCase()}
          </Text>
          <Text font={FONTS.mono} fontSize={0.22} anchorX="right" anchorY="top" position-y={-0.68} color={COLORS.dim} fillOpacity={fade}>
            {`${layer.nodes.length} NODES · ${layer.edges.length} EDGES`}
          </Text>
        </group>
      </Billboard>

      <LayerEdges views={edgeViews} layerFade={fade} detail={detail && fade > 0.5} />
      <LayerNodes views={nodeViews} layer={layer.index} layerFade={fade} interactive={interactive} detail={detail && fade > 0.5} />
      {particles && deco && fade > 0.5 && <Particles paths={paths} />}
      <LiveOverlay tower={tower} views={nodeViews} fade={fade} subtrees={subtrees} muted={!interactive} />
    </group>
  );
});

function gridGeometry(w: number, d: number, step: number) {
  const pts: number[] = [];
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) pts.push(x, 0, -d / 2, x, 0, d / 2);
  for (let z = -d / 2; z <= d / 2 + 1e-6; z += step) pts.push(-w / 2, 0, z, w / 2, 0, z);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

/** HUD-style L brackets on the four plate corners (pairs of points for LineSegments). */
function cornerBrackets(w: number, d: number, len: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = (sx * w) / 2;
    const z = (sz * d) / 2;
    out.push([x, 0.01, z], [x - sx * len, 0.01, z], [x, 0.01, z], [x, 0.01, z - sz * len]);
  }
  return out;
}
