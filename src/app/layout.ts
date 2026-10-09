import { useEffect, useState } from 'react';
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { EdgeKind, Protocol } from '../core/schema';
import type { ResolvedLayer, ResolvedTower } from '../core/types';
import { NODE_H, NODE_W, SCALE } from './theme';

export type XZ = [number, number];

export interface NodeBox { key: string; x: number; z: number; w: number; d: number }
export interface EdgePath { id: string; kind: EdgeKind; from: string; to: string; label?: string; protocol?: Protocol; version?: string; async?: boolean; group?: string; points: XZ[] }
export interface LayerLayout { index: number; width: number; depth: number; nodes: Record<string, NodeBox>; edges: EdgePath[] }
export interface TowerLayout { layers: LayerLayout[]; width: number; depth: number }

const elk = new ELK();

const OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.spacing.nodeNode': '44',
  'elk.spacing.edgeNode': '22',
  'elk.spacing.edgeEdge': '14',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
};

/** Lays out one layer left-to-right and converts it to world units centered on the origin. */
async function layoutLayer(layer: ResolvedLayer): Promise<LayerLayout> {
  const graph: ElkNode = {
    id: layer.id,
    layoutOptions: OPTIONS,
    children: layer.nodes.map((n) => ({ id: n.key, width: NODE_W, height: NODE_H })),
    edges: layer.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };
  const out = await elk.layout(graph);
  const w = (out.width ?? 0) * SCALE;
  const d = (out.height ?? 0) * SCALE;
  const toWorld = (x: number, y: number): XZ => [x * SCALE - w / 2, y * SCALE - d / 2];

  const nodes: Record<string, NodeBox> = {};
  for (const c of out.children ?? []) {
    const [x, z] = toWorld((c.x ?? 0) + NODE_W / 2, (c.y ?? 0) + NODE_H / 2);
    nodes[c.id] = { key: c.id, x, z, w: NODE_W * SCALE, d: NODE_H * SCALE };
  }

  const edges = layer.edges.map((e): EdgePath => {
    const s = out.edges?.find((o) => o.id === e.id)?.sections?.[0];
    const points = s
      ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => toWorld(p.x, p.y))
      : [[nodes[e.from].x, nodes[e.from].z], [nodes[e.to].x, nodes[e.to].z]] as XZ[];
    return { id: e.id, kind: e.kind, from: e.from, to: e.to, label: e.label, protocol: e.protocol, version: e.version, async: e.async, group: e.group, points };
  });

  return { index: layer.index, width: w, depth: d, nodes, edges };
}

export async function layoutTower(tower: ResolvedTower): Promise<TowerLayout> {
  const layers = await Promise.all(tower.layers.map(layoutLayer));
  return {
    layers,
    width: Math.max(0, ...layers.map((l) => l.width)),
    depth: Math.max(0, ...layers.map((l) => l.depth)),
  };
}

/** Async layout as a hook; keeps the previous layout on screen while the next one computes. */
export function useLayout(tower?: ResolvedTower) {
  const [layout, setLayout] = useState<{ tower: ResolvedTower; layout: TowerLayout }>();
  useEffect(() => {
    if (!tower) return;
    let alive = true;
    layoutTower(tower).then((l) => alive && setLayout({ tower, layout: l })).catch(console.error);
    return () => { alive = false; };
  }, [tower]);
  return layout;
}

/** Point at fraction t (0..1) along a polyline, by length. */
export function pointAt(points: XZ[], t: number): XZ {
  const segs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let target = segs.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, target / segs[i]) : 0;
      const [a, b] = [points[i], points[i + 1]];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    target -= segs[i];
  }
  return points[0];
}

/** Text drawn on an edge: protocol (and version), label, then fire-and-forget and alternative markers. */
export function edgeText(e: { protocol?: string; version?: string; label?: string; async?: boolean; group?: string }): string {
  return [e.protocol && `${e.protocol.toUpperCase()}${e.version ? ` ${e.version}` : ''}`, e.label, e.async && 'ASYNC', e.group && `ALT ${e.group}`]
    .filter(Boolean).join(' · ');
}
