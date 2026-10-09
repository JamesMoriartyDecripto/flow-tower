import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CameraControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { matches, related } from '../graph';
import { useLayout, type TowerLayout } from '../layout';
import { useStore, useTower } from '../store';
import { LAYER_GAP, PLATE_PAD } from '../theme';
import { Ambient, Base, Scanner } from './Environment';
import { Layer, type Visual } from './Layer';
import { Links } from './Links';

/** Root of the 3D scene: stacks the layers, animates spacing, drives the camera. */
export function TowerScene() {
  const current = useTower();
  const data = useLayout(current);
  if (!data) return null;
  return <Stack key={data.tower.id} tower={data.tower} layout={data.layout} />;
}

function Stack({ tower, layout }: { tower: NonNullable<ReturnType<typeof useTower>>; layout: TowerLayout }) {
  const { explode, focusedLayer, selected, hovered, search, hiddenTypes, runtimeFocus, autoRotate, viewNonce } = useStore();
  const spacing = useRef(0.02); // starts collapsed: the tower "assembles" on mount
  const group = useRef<Group>(null);
  const links = useRef<Group>(null);
  const controls = useRef<CameraControls>(null);

  const n = tower.layers.length;
  const width = layout.width + PLATE_PAD * 2;
  const depth = layout.depth + PLATE_PAD * 2;
  const height = (n - 1) * LAYER_GAP * explode;
  const layerY = (i: number) => height / 2 - i * LAYER_GAP * explode;

  useFrame((_, dt) => {
    spacing.current += (explode - spacing.current) * (1 - Math.exp(-dt * 3.2));
    if (group.current) group.current.position.y = ((n - 1) * LAYER_GAP * spacing.current) / 2;
    if (links.current) links.current.scale.y = Math.max(spacing.current, 1e-3);
    if (autoRotate && focusedLayer === undefined) controls.current?.rotate(dt * 0.12, 0, false);
  });

  // Camera: overview of the whole tower, or a tilted top-down view of the focused layer.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (focusedLayer === undefined) {
      // Fit the taller of (tower height, plate width) inside the vertical field of view.
      const fit = Math.max(height + 10, width * 0.75, depth) / (2 * Math.tan((42 / 2) * (Math.PI / 180)));
      const dir = new Vector3(0.5, 0.32, 0.85).normalize().multiplyScalar(fit * 1.12);
      c.setLookAt(dir.x, dir.y, dir.z, 0, 0, 0, true);
    } else {
      const y = layerY(focusedLayer);
      const r = Math.max(width * 0.82, depth * 1.5);
      c.setLookAt(0, y + r * 0.92, r * 0.5, 0, y, 0, true);
    }
  }, [focusedLayer, width, depth, height, viewNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.body.style.cursor = hovered ? 'pointer' : ''; }, [hovered]);

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
      return 1;
    },
    edgeHighlight: (id) => rel?.edges.has(id),
  }), [selected, hovered, hiddenTypes, types, runtimeFocus, runtimeOf, hits, rel]);
  const layerFade = useCallback(
    (i: number) => (focusedLayer === undefined || i === focusedLayer ? 1 : i < focusedLayer ? 0.04 : 0.28),
    [focusedLayer],
  );

  return (
    <>
      <Ambient size={[width * 1.4, height + 12, depth * 2]} />
      <CameraControls ref={controls} makeDefault minDistance={4} maxDistance={400} dollySpeed={0.6} smoothTime={0.35} />
      <group ref={group}>
        {tower.layers.map((l, i) => (
          <Layer
            key={l.id}
            layer={l}
            layout={layout.layers[i]}
            width={width}
            depth={depth}
            spacing={spacing}
            fade={layerFade(i)}
            interactive={focusedLayer === undefined || i === focusedLayer}
            visual={visual}
          />
        ))}
        <group ref={links}>
          <Links links={tower.links} layout={layout} layerIndex={layerIndex} visual={visual} layerFade={layerFade} />
          <Pillars width={width} depth={depth} bottom={-(n - 1) * LAYER_GAP} />
        </group>
      </group>
      {focusedLayer === undefined && <Scanner width={width} depth={depth} top={height / 2 + 1} bottom={-height / 2 - 1} />}
      <Base radius={Math.max(width, depth) * 0.62} y={-height / 2 - 5} dim={focusedLayer !== undefined} />
    </>
  );
}

/** Thin vertical frame lines at the plate corners: reads as one structure, not loose sheets. */
function Pillars({ width, depth, bottom }: { width: number; depth: number; bottom: number }) {
  const [x, z] = [width / 2, depth / 2];
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-x, 2, -z, -x, bottom - 2, -z, x, 2, -z, x, bottom - 2, -z, x, 2, z, x, bottom - 2, z, -x, 2, z, -x, bottom - 2, z]), 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#5d7aa8" transparent opacity={0.35} />
    </lineSegments>
  );
}
