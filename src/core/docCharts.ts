import { EDGE_KINDS, NODE_TYPES, type EdgeKind, type NodeType } from './schema.ts';
import type { ResolvedEdge, ResolvedNode, ResolvedTower, Workspace } from './types.ts';
import { nodeCode, printedTowers } from './docSummary.ts';

/*
 * Chart data of one tower's chapter: plain numbers computed from the resolved tower. The drawing lives in
 * src/app/doc/Charts.tsx; this file only counts, so the counts can be tested and do not depend on the DOM.
 * Layers are coded L01, L02... by their index, as the document's layer headings are.
 */

export const layerCode = (index: number) => `L${String(index + 1).padStart(2, '0')}`;

/** Every edge of the tower: each layer's own edges first, then the cross-layer links. */
function edgesOf(t: ResolvedTower): ResolvedEdge[] {
  return [...t.layers.flatMap((l) => l.edges), ...t.links];
}

function nodesOf(t: ResolvedTower): ResolvedNode[] {
  return t.layers.flatMap((l) => l.nodes);
}

/** The position in `t.layers` of the layer that holds each node key. Keys are unique in a tower. */
function layerPosOf(t: ResolvedTower): Map<string, number> {
  const out = new Map<string, number>();
  t.layers.forEach((l, i) => { for (const n of l.nodes) out.set(n.key, i); });
  return out;
}

export interface LayerMatrix {
  codes: string[];
  /** counts[from][to]: edges from a node of layer `from` to a node of layer `to`. The diagonal is inside a layer. */
  counts: number[][];
}

export function layerMatrix(t: ResolvedTower): LayerMatrix {
  const pos = layerPosOf(t);
  const n = t.layers.length;
  const counts = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const e of edgesOf(t)) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (a !== undefined && b !== undefined) counts[a][b] += 1;
  }
  return { codes: t.layers.map((l) => layerCode(l.index)), counts };
}

export interface LayerComposition {
  code: string;
  title: string;
  nodes: number;
  /** Only the types the layer holds, in the schema's order. */
  byType: { type: NodeType; nodes: number }[];
}

export function layerComposition(t: ResolvedTower): LayerComposition[] {
  return t.layers.map((l) => {
    const counts = new Map<NodeType, number>();
    for (const n of l.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
    return {
      code: layerCode(l.index),
      title: l.title,
      nodes: l.nodes.length,
      byType: NODE_TYPES.filter((ty) => counts.has(ty)).map((type) => ({ type, nodes: counts.get(type)! })),
    };
  });
}

/** Edge counts per kind, in the schema's order; a kind the tower does not use is left out. */
export function edgesByKind(t: ResolvedTower): { kind: EdgeKind; edges: number }[] {
  const counts = new Map<EdgeKind, number>();
  for (const e of edgesOf(t)) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return EDGE_KINDS.filter((k) => counts.has(k)).map((kind) => ({ kind, edges: counts.get(kind)! }));
}

/** How many nodes the most-connected table lists. */
export const TOP_CONNECTED = 10;

export interface ConnectedNode {
  ref: string;
  key: string;
  label: string;
  layer: string;
  in: number;
  out: number;
}

/**
 * The nodes with the most edges (in + out), most first; a tie goes to the lower ref, so the order is
 * stable. A node with no edge is not listed.
 */
export function topConnected(t: ResolvedTower): ConnectedNode[] {
  const inn = new Map<string, number>();
  const out = new Map<string, number>();
  for (const e of edgesOf(t)) {
    out.set(e.from, (out.get(e.from) ?? 0) + 1);
    inn.set(e.to, (inn.get(e.to) ?? 0) + 1);
  }
  const rows: ConnectedNode[] = [];
  for (const l of t.layers) {
    l.nodes.forEach((n, pos) => {
      const i = inn.get(n.key) ?? 0;
      const o = out.get(n.key) ?? 0;
      if (i + o > 0) rows.push({ ref: nodeCode(l.index, pos + 1), key: n.key, label: n.label, layer: layerCode(l.index), in: i, out: o });
    });
  }
  rows.sort((a, b) => (b.in + b.out) - (a.in + a.out) || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  return rows.slice(0, TOP_CONNECTED);
}

/** The node types a governance control is asked of: the things that act, decide or cost money. */
export const GOVERNED_TYPES: NodeType[] = ['agent', 'process', 'tool', 'model', 'human', 'decision'];

/** The operational controls a governed node should carry. Keys of the node's resolved `ops`. */
export const CONTROLS = ['budget', 'limits', 'evals', 'approval', 'sandbox', 'sla'] as const;
export type Control = (typeof CONTROLS)[number];

export interface ControlCoverage {
  control: Control;
  /** Governed nodes that carry this control. */
  n: number;
  /** Governed nodes in the tower: the denominator of `n / total`. */
  total: number;
}

function carries(n: ResolvedNode, c: Control): boolean {
  const v = n.ops[c];
  return Array.isArray(v) ? v.length > 0 : v !== undefined;
}

export function governanceCoverage(t: ResolvedTower): ControlCoverage[] {
  const governed = nodesOf(t).filter((n) => GOVERNED_TYPES.includes(n.type));
  return CONTROLS.map((control) => ({
    control,
    n: governed.filter((n) => carries(n, control)).length,
    total: governed.length,
  }));
}

export interface LayerTable {
  /** The distinct values across the tower, sorted: the table's columns. */
  columns: string[];
  rows: { code: string; title: string; counts: number[] }[];
}

function layerTable(t: ResolvedTower, valueOf: (n: ResolvedNode) => string | undefined): LayerTable {
  const columns = [...new Set(nodesOf(t).map(valueOf).filter((v): v is string => !!v))].sort();
  const rows = t.layers.map((l) => ({
    code: layerCode(l.index),
    title: l.title,
    counts: columns.map((c) => l.nodes.filter((n) => valueOf(n) === c).length),
  }));
  return { columns, rows };
}

/** Nodes per layer and runtime. A node without a runtime is not counted in any column. */
export function runtimesByLayer(t: ResolvedTower): LayerTable {
  return layerTable(t, (n) => n.runtime?.label ?? n.runtime?.id);
}

/** Nodes per layer and model: the node's own model, else its agent's. */
export function modelsByLayer(t: ResolvedTower): LayerTable {
  return layerTable(t, (n) => n.model ?? n.agent?.model);
}

export interface TowerTree {
  id: string;
  title: string;
  layers: number;
  nodes: number;
  children: TowerTree[];
}

/**
 * The sub-towers under a root, as the nodes name them. Only towers the document prints are listed, and each
 * tower appears once, so a tower used twice does not repeat its branch.
 */
export function subTowerTree(ws: Workspace, rootId: string): TowerTree {
  const printed = printedTowers(ws, rootId).depths;
  const seen = new Set<string>([rootId]);
  const build = (id: string): TowerTree => {
    const t = ws.towers[id];
    const children: TowerTree[] = [];
    for (const n of nodesOf(t)) {
      if (n.tower && printed.has(n.tower) && !seen.has(n.tower)) {
        seen.add(n.tower);
        children.push(build(n.tower));
      }
    }
    return { id, title: t.name, layers: t.layers.length, nodes: nodesOf(t).length, children };
  };
  return build(rootId);
}

/** Every chart of one chapter. The tree is set only on a root chapter (depth 0): a sub-tower has no tree of its own. */
export interface ChapterCharts {
  matrix: LayerMatrix;
  composition: LayerComposition[];
  edges: { kind: EdgeKind; edges: number }[];
  connected: ConnectedNode[];
  coverage: ControlCoverage[];
  runtimes: LayerTable;
  models: LayerTable;
  tree?: TowerTree;
}

/** A table wider than this many columns (its label column included) takes the full width of the page. */
export const WIDE_TABLE_COLUMNS = 5;

/** A half-width card cannot hold a table of more columns than this, so the card spans the whole row. */
export function isWideTable(table: LayerTable): boolean {
  return table.columns.length + 1 > WIDE_TABLE_COLUMNS;
}

/**
 * The rows of page B, counted in table lines: the governance rows, the edge kinds, the most-connected nodes,
 * the two layer tables and the tree's towers. A small tower's page B is short, so it flows onto page A.
 */
export const PAGE_B_FLOW_LINES = 24;

function treeSize(t: TowerTree): number {
  return 1 + t.children.reduce((n, c) => n + treeSize(c), 0);
}

export function pageBLines(c: ChapterCharts): number {
  return CONTROLS.length + c.edges.length + c.connected.length
    + c.runtimes.rows.length + c.models.rows.length + (c.tree ? treeSize(c.tree) : 0);
}

/** True when page B is short enough that its rows may start on page A, after the snapshot and the matrix. */
export function pageBFlows(c: ChapterCharts): boolean {
  return pageBLines(c) <= PAGE_B_FLOW_LINES;
}

export function chapterCharts(ws: Workspace, towerId: string, root: boolean): ChapterCharts {
  const t = ws.towers[towerId];
  return {
    matrix: layerMatrix(t),
    composition: layerComposition(t),
    edges: edgesByKind(t),
    connected: topConnected(t),
    coverage: governanceCoverage(t),
    runtimes: runtimesByLayer(t),
    models: modelsByLayer(t),
    tree: root ? subTowerTree(ws, towerId) : undefined,
  };
}
