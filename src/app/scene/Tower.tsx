import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { CameraControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { matches, related } from '../graph';
import { useLayout, type TowerLayout } from '../layout';
import { useStore, useTower } from '../store';
import { LAYER_GAP, PLATE_PAD } from '../theme';
import { Ambient, Base, Scanner } from './Environment';
import { Layer, type Visual } from './Layer';
import { createLens, stepLens } from './lens';
import { Links } from './Links';
import { useShiftPan } from './shiftPan';
import { decorative, keepAlive } from './frameBudget';
import { useChipProjector } from './chips';
import { useFollow, useSceneLive } from '../liveHooks';
import { useLive } from '../live';

/** Root of the 3D scene: stacks the layers, animates spacing, drives the camera. */
export function TowerScene() {
  const current = useTower();
  const data = useLayout(current);
  if (!data) return null;
  return <Stack key={data.tower.id} tower={data.tower} layout={data.layout} />;
}

function Stack({ tower, layout }: { tower: NonNullable<ReturnType<typeof useTower>>; layout: TowerLayout }) {
  const { explode, focusedLayer, hoveredLayer, selected, hovered, search, hiddenTypes, runtimeFocus, autoRotate, viewNonce, quality, animations } = useStore();
  const deco = decorative(quality, animations);
  const spacing = useRef(0.02); // starts collapsed: the tower "assembles" on mount
  const lens = useMemo(() => createLens(tower.layers.length), [tower]);
  const group = useRef<Group>(null);
  const pillars = useRef<Group>(null);
  const controls = useRef<CameraControls>(null);

  const n = tower.layers.length;
  const width = layout.width + PLATE_PAD * 2;
  const depth = layout.depth + PLATE_PAD * 2;
  const height = (n - 1) * LAYER_GAP * explode;
  const layerY = (i: number) => height / 2 - i * LAYER_GAP * explode;

  useFrame((_, dt) => {
    spacing.current += (explode - spacing.current) * (1 - Math.exp(-dt * 3.2));
    if (group.current) group.current.position.y = ((n - 1) * LAYER_GAP * spacing.current) / 2;
    if (pillars.current) pillars.current.scale.y = Math.max(spacing.current, 1e-3);
    // The lens only applies in overview: in focus mode the camera already isolates one layer.
    const lensMoved = stepLens(lens, spacing.current, focusedLayer === undefined ? hoveredLayer : undefined, dt);
    // On-demand rendering: keep frames coming only while something is actually moving.
    if (lensMoved || Math.abs(explode - spacing.current) > 1e-3) keepAlive(120);
    if (autoRotate && focusedLayer === undefined) {
      controls.current?.rotate(dt * 0.12, 0, false);
      keepAlive(120);
    }
  });

  // Camera: overview of the whole tower, or a tilted top-down view of the focused layer.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (focusedLayer === undefined) {
      // Fit the taller of (tower height, plate width) inside the vertical field of view.
      const fit = Math.max(height + 10, width * 0.75, depth) / (2 * Math.tan((42 / 2) * (Math.PI / 180)));
      const dir = new Vector3(0.5, 0.32, 0.85).normalize().multiplyScalar(fit * 1.3);
      c.setLookAt(dir.x, dir.y, dir.z, 0, 0, 0, true);
      keepAlive(1500);
    } else {
      const y = layerY(focusedLayer);
      // Fit the focused layer's own flowchart, not the (wider) shared plate.
      const own = layout.layers[focusedLayer];
      const r = Math.max((own.width + 4) * 0.82, (own.depth + 4) * 1.5, 10);
      c.setLookAt(0, y + r * 0.92, r * 0.5, 0, y, 0, true);
      keepAlive(1500);
    }
  }, [focusedLayer, width, depth, height, viewNonce, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.body.style.cursor = hovered ? 'pointer' : ''; }, [hovered]);
  useShiftPan(controls);
  useFollow();
  const layerIds = useMemo(() => tower.layers.map((l) => l.id), [tower]);
  useChipProjector(layout, layerIds);
  const live = useSceneLive();
  const feedOpen = useLive((s) => s.feedOpen);
  // Static dim while the feed is open; the live overlay re-lights active nodes every frame.
  const spotlight = useLive((s) => s.spotlight) && feedOpen;

  const layerIndex = useMemo(() => Object.fromEntries(tower.layers.map((l) => [l.id, l.index])), [tower]);
  const focusKey = selected ?? hovered;
  const rel = useMemo(() => (focusKey ? related(tower, focusKey) : undefined), [tower, focusKey]);
  const hits = useMemo(() => {
    if (!search.trim()) return undefined;
    return new Set(tower.layers.flatMap((l) => l.nodes.filter((nd) => matches(nd, search)).map((nd) => nd.key)));
  }, [tower, search]);

  const types = useMemo(() => Object.fromEntries(tower.layers.flatMap((l) => l.nodes.map((nd) => [nd.key, nd.type]))), [tower]);
  const runtimeOf = useMemo(() => Object.fromEntries(tower.layers.flatMap((l) => l.nodes.map((nd) => [nd.key, nd.runtime?.id]))), [tower]);
  const visual = useMemo<Visual>(() => ({
    selected,
    hovered,
    nodeFade(key) {
      if (hiddenTypes.has(types[key])) return 0.08;
      if (runtimeFocus) return runtimeOf[key] === runtimeFocus ? 1 : 0.14;
      if (hits) return hits.has(key) ? 1 : 0.18;
      if (rel) return rel.nodes.has(key) ? 1 : 0.22;
      if (spotlight) return 0.38;
      return 1;
    },
    edgeHighlight: (id) => rel?.edges.has(id),
  }), [selected, hovered, hiddenTypes, types, runtimeFocus, runtimeOf, hits, rel, spotlight]);
  const layerFade = useCallback((i: number) => {
    if (focusedLayer !== undefined) return i === focusedLayer ? 1 : i < focusedLayer ? 0.04 : 0.1;
    if (hoveredLayer === undefined) return 1;
    return [1, 0.72, 0.4][Math.min(Math.abs(i - hoveredLayer), 2)];
  }, [focusedLayer, hoveredLayer]);

  return (
    <>
      <Ambient w={width * 1.4} h={height + 12} d={depth * 2} sparkles={deco} />
      <CameraControls ref={controls} makeDefault minDistance={4} maxDistance={400} dollySpeed={0.6} smoothTime={0.35} />
      <group ref={group}>
        {tower.layers.map((l, i) => (
          <Layer
            key={l.id}
            tower={tower.id}
            layer={l}
            layout={layout.layers[i]}
            width={width}
            depth={depth}
            lens={lens}
            fade={layerFade(i)}
            interactive={focusedLayer === undefined || i === focusedLayer}
            focused={focusedLayer === i}
            visual={visual}
            liveTint={live.tints[l.id]}
            subtrees={live.subtrees}
          />
        ))}
        <Links links={tower.links} layout={layout} layerIndex={layerIndex} visual={visual} layerFade={layerFade} lens={lens} />
        <group ref={pillars}>
          <Pillars width={width} depth={depth} bottom={-(n - 1) * LAYER_GAP} />
        </group>
      </group>
      {deco && focusedLayer === undefined && <Scanner width={width} depth={depth} top={height / 2 + 1} bottom={-height / 2 - 1} />}
      <Base radius={Math.max(width, depth) * 0.62} y={-height / 2 - 5} dim={focusedLayer !== undefined} spin={deco} />
    </>
  );
}

/** Thin vertical frame lines at the plate corners: reads as one structure, not loose sheets. */
const Pillars = memo(function Pillars({ width, depth, bottom }: { width: number; depth: number; bottom: number }) {
  const [x, z] = [width / 2, depth / 2];
  const positions = useMemo(
    () => new Float32Array([-x, 2, -z, -x, bottom - 2, -z, x, 2, -z, x, bottom - 2, -z, x, 2, z, x, bottom - 2, z, -x, 2, z, -x, bottom - 2, z]),
    [x, z, bottom],
  );
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#5d7aa8" transparent opacity={0.35} />
    </lineSegments>
  );
});
