import { EDGE_KINDS, NODE_TYPES, type EdgeKind, type NodeType, type OpsDef, type Status } from './schema.ts';
import type { Issue, ResolvedEdge, ResolvedNode, ResolvedTower, Workspace } from './types.ts';

/*
 * The content of a tower's PDF document, as plain data. The HTML view, the CLI and the tests all read
 * this one shape, so the printed document cannot drift from what the app shows. No DOM here.
 */

export interface NodeRef {
  key: string;
  label: string;
  /** Anchor of the node's detail in the document, so the view can link to it. */
  anchor: string;
}

export interface EdgeRef {
  label?: string;
  kind: EdgeKind;
  other: NodeRef;
}

export interface LinkRow {
  label?: string;
  kind: EdgeKind;
  from: NodeRef;
  to: NodeRef;
}

export interface NodeRow {
  id: string;
  key: string;
  label: string;
  type: NodeType;
  description?: string;
  runtime?: string;
  status: Status;
}

export interface NodeDetail {
  /** Anchor, unique across the document: tower id + node key. */
  id: string;
  key: string;
  label: string;
  type: NodeType;
  description?: string;
  agent?: { name?: string; model?: string; prompt?: string };
  tools: string[];
  runtime?: string;
  /** Operational facts as [label, value] pairs, short text. */
  ops: [string, string][];
  incoming: EdgeRef[];
  outgoing: EdgeRef[];
  files: string[];
  subTower?: { id: string; title: string; anchor?: string };
}

export interface LayerSection {
  id: string;
  index: number;
  title: string;
  description?: string;
  nodes: NodeRow[];
  details?: NodeDetail[];
}

export interface Chapter {
  id: string;
  towerId: string;
  title: string;
  description?: string;
  /** 0 for the tower itself, 1 for its nested towers, and so on. */
  depth: number;
  layers: LayerSection[];
  links: LinkRow[];
  budget?: string[];
}

export interface TocEntry {
  id: string;
  label: string;
  depth: number;
}

export interface LegendItem {
  value: string;
  label: string;
}

export interface Legend {
  types: LegendItem[];
  edgeKinds: LegendItem[];
  runtimes: LegendItem[];
}

export interface TowerDoc {
  title: string;
  description?: string;
  towerId: string;
  level: 1 | 2 | 3;
  generated: {
    tags: string[];
    /** Totals over the chapters in this document. */
    counts: { layers: number; nodes: number; agents: number; subTowers: number };
  };
  toc: TocEntry[];
  chapters: Chapter[];
  legend?: Legend;
  issues?: Issue[];
  sources?: string[];
}

/** Lower-case, `[a-z0-9-]` only: safe in an HTML id, a fragment link and a PDF destination. */
export function anchor(...parts: string[]): string {
  return parts
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');
}

const towerAnchor = (towerId: string) => anchor('tower', towerId);
const layerAnchor = (towerId: string, layerId: string) => anchor('layer', towerId, layerId);
const nodeAnchor = (towerId: string, key: string) => anchor('node', towerId, key);

/** Long text is cut so the printed rows stay one line or a short paragraph. */
function cut(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** The first sentence, cut at about 140 characters: the node row stays readable. */
function firstSentence(text?: string): string | undefined {
  if (!text) return undefined;
  const s = collapse(text);
  const m = /^.*?[.!?](\s|$)/.exec(s);
  return cut(m ? m[0].trim() : s, 140);
}

function shortValue(v: unknown): string {
  return cut(typeof v === 'string' ? collapse(v) : JSON.stringify(v), 200);
}

/** Operational facts that are set, in the schema's own order. */
function opsRows(ops: Partial<OpsDef>): [string, string][] {
  return Object.entries(ops as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k.replace(/_/g, ' '), shortValue(v)]);
}

function titleCase(s: string): string {
  const spaced = s.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The towers to print, with their depth from the root, in discovery order (root first, then its
 * nested towers, layer by layer). A map keeps each tower once, so a cycle stops at the second visit.
 */
function includedTowers(ws: Workspace, rootId: string, maxDepth: number): Map<string, number> {
  const depths = new Map<string, number>([[rootId, 0]]);
  // A Map iterator also visits the entries added while looping: this is a breadth-first walk.
  for (const [id, depth] of depths) {
    if (depth >= maxDepth) continue;
    for (const layer of ws.towers[id]?.layers ?? []) {
      for (const n of layer.nodes) {
        if (n.tower && ws.towers[n.tower] && !depths.has(n.tower)) depths.set(n.tower, depth + 1);
      }
    }
  }
  return depths;
}

interface Usage {
  types: Set<NodeType>;
  edgeKinds: Set<EdgeKind>;
  runtimes: Map<string, string>;
  sources: Set<string>;
}

function chapterOf(
  ws: Workspace, t: ResolvedTower, depths: Map<string, number>, level: 1 | 2 | 3, usage: Usage,
): Chapter {
  const id = t.id;
  const byKey = new Map<string, ResolvedNode>();
  for (const l of t.layers) for (const n of l.nodes) byKey.set(n.key, n);
  const nodeRef = (key: string): NodeRef => ({
    key, label: byKey.get(key)?.label ?? key, anchor: nodeAnchor(id, key),
  });
  const allEdges: ResolvedEdge[] = [...t.layers.flatMap((l) => l.edges), ...t.links];
  for (const e of allEdges) usage.edgeKinds.add(e.kind);

  const layers: LayerSection[] = t.layers.map((l) => {
    const section: LayerSection = { id: layerAnchor(id, l.id), index: l.index, title: l.title, nodes: [] };
    if (level === 1) return section;
    section.description = l.description;
    section.nodes = l.nodes.map((n) => {
      usage.types.add(n.type);
      if (n.runtime) usage.runtimes.set(n.runtime.id, n.runtime.label ?? n.runtime.id);
      return {
        id: nodeAnchor(id, n.key),
        key: n.key,
        label: n.label,
        type: n.type,
        description: firstSentence(n.description),
        runtime: n.runtime?.label ?? n.runtime?.id,
        status: n.status,
      };
    });
    if (level === 3) section.details = l.nodes.map((n) => nodeDetail(ws, t, n, depths, allEdges, nodeRef, usage));
    return section;
  });

  return {
    id: towerAnchor(id),
    towerId: id,
    title: t.name,
    description: t.description,
    depth: depths.get(id) ?? 0,
    layers,
    links: t.links.map((e) => ({ label: e.label, kind: e.kind, from: nodeRef(e.from), to: nodeRef(e.to) })),
    budget: t.run ? opsRows({ budget: t.run.budget, limits: t.run.limits }).map(([k, v]) => `${k}: ${v}`) : undefined,
  };
}

function nodeDetail(
  ws: Workspace, t: ResolvedTower, n: ResolvedNode, depths: Map<string, number>,
  allEdges: ResolvedEdge[], nodeRef: (key: string) => NodeRef, usage: Usage,
): NodeDetail {
  const prompt = n.prompt?.source ?? n.agent?.prompt?.source;
  if (prompt) usage.sources.add(prompt);
  for (const f of n.files) usage.sources.add(f);
  return {
    id: nodeAnchor(t.id, n.key),
    key: n.key,
    label: n.label,
    type: n.type,
    description: n.description ? collapse(n.description) : undefined,
    agent: n.agent
      ? { name: n.agent.name, model: n.model ?? n.agent.model, prompt: prompt }
      : undefined,
    tools: n.tools,
    runtime: n.runtime?.label ?? n.runtime?.id,
    ops: opsRows(n.ops),
    incoming: allEdges.filter((e) => e.to === n.key).map((e) => ({ label: e.label, kind: e.kind, other: nodeRef(e.from) })),
    outgoing: allEdges.filter((e) => e.from === n.key).map((e) => ({ label: e.label, kind: e.kind, other: nodeRef(e.to) })),
    files: n.files,
    subTower: n.tower
      ? {
        id: n.tower,
        title: ws.towers[n.tower]?.name ?? n.tower,
        // Only a tower that is printed has a chapter to link to; a deeper one is named, not linked.
        anchor: depths.has(n.tower) ? towerAnchor(n.tower) : undefined,
      }
      : undefined,
  };
}

function tocOf(chapters: Chapter[], level: 1 | 2 | 3): TocEntry[] {
  const toc: TocEntry[] = [];
  for (const c of chapters) {
    toc.push({ id: c.id, label: c.title, depth: c.depth });
    for (const l of c.layers) {
      toc.push({ id: l.id, label: l.title, depth: c.depth + 1 });
      if (level === 3) for (const n of l.nodes) toc.push({ id: n.id, label: n.label, depth: c.depth + 2 });
    }
  }
  return toc;
}

/**
 * The document of one tower. Level 1: the layer map only. Level 2: every node as a row. Level 3: a
 * detail per node, the nested towers (up to `maxDepth`), issues and the source files.
 * Same input, same output: order follows the tower, sets are sorted.
 */
export function towerDoc(
  ws: Workspace, towerId: string, level: 1 | 2 | 3, opts: { maxDepth?: number } = {},
): TowerDoc {
  const root = ws.towers[towerId];
  if (!root) throw new Error(`unknown tower: ${towerId}`);
  const depths = includedTowers(ws, towerId, level === 3 ? (opts.maxDepth ?? 3) : 0);
  const usage: Usage = { types: new Set(), edgeKinds: new Set(), runtimes: new Map(), sources: new Set() };

  const chapters = [...depths.keys()].map((id) => chapterOf(ws, ws.towers[id], depths, level, usage));

  let layers = 0;
  let nodes = 0;
  let agents = 0;
  for (const id of depths.keys()) {
    for (const l of ws.towers[id].layers) {
      layers++;
      nodes += l.nodes.length;
      agents += l.nodes.filter((n) => n.agent).length;
    }
  }

  const doc: TowerDoc = {
    title: root.name,
    description: root.description,
    towerId,
    level,
    generated: { tags: root.tags, counts: { layers, nodes, agents, subTowers: depths.size - 1 } },
    toc: tocOf(chapters, level),
    chapters,
  };
  if (level >= 2) {
    doc.legend = {
      types: [...usage.types]
        .sort((a, b) => NODE_TYPES.indexOf(a) - NODE_TYPES.indexOf(b))
        .map((v) => ({ value: v, label: titleCase(v) })),
      edgeKinds: [...usage.edgeKinds]
        .sort((a, b) => EDGE_KINDS.indexOf(a) - EDGE_KINDS.indexOf(b))
        .map((v) => ({ value: v, label: titleCase(v) })),
      runtimes: [...usage.runtimes.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([value, label]) => ({ value, label })),
    };
  }
  if (level === 3) {
    doc.issues = root.issues.map((i) => ({ ...i }));
    doc.sources = [...usage.sources].sort();
  }
  return doc;
}
