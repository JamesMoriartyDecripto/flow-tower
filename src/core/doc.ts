import { EDGE_KINDS, NODE_TYPES, type EdgeKind, type NodeType, type OpsDef, type Status } from './schema.ts';
import type { ResolvedEdge, ResolvedNode, ResolvedTower, Workspace } from './types.ts';
import { fieldsOf, type Field } from './docFields.ts';
import { classificationOf, docSummary, MAX_TOWERS, nodeCode, printedTowers, type DocSummary } from './docSummary.ts';
import { findingsOf, severityCounts, type Finding, type SeverityCount } from './docFindings.ts';
import { appendixFiles, type AppendixFile } from './docFiles.ts';

export { canonicalJson, classificationOf, docSummary, type DocSummary } from './docSummary.ts';
export { findingsOf, severityCounts, type Finding, type SeverityCount } from './docFindings.ts';

/*
 * The content of a tower's PDF document, as plain data. The HTML view, the CLI and the tests all read
 * this one shape, so the printed document cannot drift from what the app shows. No DOM here.
 */

export interface NodeRef {
  key: string;
  label: string;
  /** Anchor of the node's detail; cleared when the document does not print that detail. */
  anchor?: string;
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
  /** Reference code, `N-L01.03`: the node's layer and its position in that layer. */
  ref: string;
  key: string;
  /** Anchor of the node's detail; cleared when the document does not print that detail. */
  anchor?: string;
  label: string;
  type: NodeType;
  description?: string;
  runtime?: string;
  status: Status;
}

export interface NodeDetail {
  /** Anchor, unique across the document: tower id + node key (plus the project prefix in a library). */
  id: string;
  ref: string;
  key: string;
  label: string;
  type: NodeType;
  status: Status;
  description?: string;
  agent?: { name?: string; model?: string; prompt?: string };
  tools: string[];
  runtime?: string;
  /** Operational facts, formatted for print (see docFields.ts): never raw JSON. */
  ops: Field[];
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
  /** The run-wide budget and limits of this tower, formatted for print. */
  budget?: Field[];
}

export interface TocEntry {
  /** The chapter or layer the row names; cleared if that target is not printed. */
  anchor?: string;
  label: string;
  depth: number;
  /** 0-based layer index for a layer row; absent for a chapter heading. */
  index?: number;
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

/** The document control table: who, what and how the file was made. No date, so the output is stable. */
export interface ControlBlock {
  tower: string;
  source: string;
  /** Set by the view: a SubtleCrypto digest is async, so the pure core leaves it empty. */
  fingerprint?: string;
  generator: string;
  level: string;
  classification: string;
  layers: number;
  nodes: number;
  subTowers: number;
}

export type DocLevel = 1 | 2 | 3 | 4;

export interface TowerDoc {
  title: string;
  description?: string;
  towerId: string;
  level: DocLevel;
  generated: {
    tags: string[];
    /** Totals over the chapters in this document. */
    counts: { layers: number; nodes: number; agents: number; subTowers: number };
  };
  control: ControlBlock;
  /** Level 2 and up: the counts of the executive summary page. */
  summary?: DocSummary;
  toc: TocEntry[];
  chapters: Chapter[];
  legend?: Legend;
  /** Level 3: the validation findings as numbered rows (V-01...). */
  findings?: Finding[];
  /** Level 2 and 3: the Error / Warning / Info counts. */
  severities?: SeverityCount[];
  /** Level 3: every file the printed towers reference, with the nodes that use it (text is loaded by the view). */
  files?: AppendixFile[];
  /** Set when the project has more towers than MAX_TOWERS: the printed document names the cut. */
  limitNote?: string;
  /** Level 4 only: one level-2 document per project, in workspace order, each with its own anchors. */
  projects?: TowerDoc[];
}

/** The printed name of each level: the cover, the control block and the running header all use it. */
export const LEVEL_NAMES: Record<DocLevel, string> = { 1: 'Images', 2: 'Overview', 3: 'Full documentation', 4: 'Library' };

/** Lower-case, `[a-z0-9-]` only: safe in an HTML id, a fragment link and a PDF destination. */
export function anchor(...parts: string[]): string {
  return parts
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');
}

/**
 * The project prefix goes in front of every anchor of one project's document. A library prints several
 * projects in one file, and a sub-tower shared by two of them would otherwise define the same id twice.
 */
const scoped = (prefix: string, id: string) => (prefix ? `${prefix}-${id}` : id);
const towerAnchor = (prefix: string, towerId: string) => scoped(prefix, anchor('tower', towerId));
const layerAnchor = (prefix: string, towerId: string, layerId: string) => scoped(prefix, anchor('layer', towerId, layerId));
const nodeAnchor = (prefix: string, towerId: string, key: string) => scoped(prefix, anchor('node', towerId, key));

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

/** Operational facts that are set, in the schema's own order. Values are never cut: a field must reach print. */
function opsFields(ops: Partial<OpsDef>): Field[] {
  return fieldsOf(ops as Record<string, unknown>);
}

function titleCase(s: string): string {
  const spaced = s.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Usage {
  types: Set<NodeType>;
  edgeKinds: Set<EdgeKind>;
  runtimes: Map<string, string>;
}

/** What one chapter needs from the document: its depths, the detail level and the id prefix of its project. */
interface Scope {
  ws: Workspace;
  depths: Map<string, number>;
  level: 1 | 2 | 3;
  usage: Usage;
  prefix: string;
}

function chapterOf(t: ResolvedTower, scope: Scope): Chapter {
  const { level, prefix, usage } = scope;
  const id = t.id;
  const byKey = new Map<string, ResolvedNode>();
  for (const l of t.layers) for (const n of l.nodes) byKey.set(n.key, n);
  const nodeRef = (key: string): NodeRef => ({
    key, label: byKey.get(key)?.label ?? key, anchor: nodeAnchor(prefix, id, key),
  });
  const allEdges: ResolvedEdge[] = [...t.layers.flatMap((l) => l.edges), ...t.links];
  for (const e of allEdges) usage.edgeKinds.add(e.kind);

  const layers: LayerSection[] = t.layers.map((l) => {
    const section: LayerSection = { id: layerAnchor(prefix, id, l.id), index: l.index, title: l.title, nodes: [] };
    if (level === 1) return section;
    section.description = l.description;
    section.nodes = l.nodes.map((n, pos) => {
      usage.types.add(n.type);
      if (n.runtime) usage.runtimes.set(n.runtime.id, n.runtime.label ?? n.runtime.id);
      return {
        ref: nodeCode(l.index, pos + 1),
        key: n.key,
        anchor: nodeAnchor(prefix, id, n.key),
        label: n.label,
        type: n.type,
        description: firstSentence(n.description),
        runtime: n.runtime?.label ?? n.runtime?.id,
        status: n.status,
      };
    });
    if (level === 3) {
      section.details = l.nodes.map((n, pos) => nodeDetail(t, n, nodeCode(l.index, pos + 1), allEdges, nodeRef, scope));
    }
    return section;
  });

  return {
    id: towerAnchor(prefix, id),
    towerId: id,
    title: t.name,
    description: t.description,
    depth: scope.depths.get(id) ?? 0,
    layers,
    links: t.links.map((e) => ({ label: e.label, kind: e.kind, from: nodeRef(e.from), to: nodeRef(e.to) })),
    budget: t.run ? opsFields({ budget: t.run.budget, limits: t.run.limits }) : undefined,
  };
}

function nodeDetail(
  t: ResolvedTower, n: ResolvedNode, ref: string, allEdges: ResolvedEdge[],
  nodeRef: (key: string) => NodeRef, scope: Scope,
): NodeDetail {
  const { ws, depths, prefix } = scope;
  const prompt = n.prompt?.source ?? n.agent?.prompt?.source;
  return {
    id: nodeAnchor(prefix, t.id, n.key),
    ref,
    key: n.key,
    label: n.label,
    type: n.type,
    status: n.status,
    description: n.description ? collapse(n.description) : undefined,
    agent: n.agent
      ? { name: n.agent.name, model: n.model ?? n.agent.model, prompt: prompt }
      : undefined,
    tools: n.tools,
    runtime: n.runtime?.label ?? n.runtime?.id,
    ops: opsFields(n.ops),
    incoming: allEdges.filter((e) => e.to === n.key).map((e) => ({ label: e.label, kind: e.kind, other: nodeRef(e.from) })),
    outgoing: allEdges.filter((e) => e.from === n.key).map((e) => ({ label: e.label, kind: e.kind, other: nodeRef(e.to) })),
    files: n.files,
    subTower: n.tower
      ? {
        id: n.tower,
        title: ws.towers[n.tower]?.name ?? n.tower,
        // Only a tower that is printed has a chapter to link to; a deeper one is named, not linked.
        anchor: depths.has(n.tower) ? towerAnchor(prefix, n.tower) : undefined,
      }
      : undefined,
  };
}

/**
 * Chapters and layers only: nodes are reached through their layer's table, so a TOC of every node
 * would run to pages. The root's title is the cover's, so only nested towers get a heading row.
 */
function tocOf(chapters: Chapter[]): TocEntry[] {
  const toc: TocEntry[] = [];
  for (const c of chapters) {
    if (c.depth > 0) toc.push({ anchor: c.id, label: c.title, depth: c.depth });
    // The root's layers sit at the margin; a nested tower's layers sit one step under its heading.
    const depth = c.depth === 0 ? 0 : c.depth + 1;
    for (const l of c.layers) toc.push({ anchor: l.id, label: l.title, depth, index: l.index });
  }
  return toc;
}

/**
 * Clears every reference whose target the document does not print. The defined anchors are the
 * chapters, the layers and the node details; an edge, a link row, a sub-tower or a TOC row that points
 * anywhere else would be a dead link, so the view prints it as plain text. Level 2 has no details, so
 * its node references are cleared here. Only this fresh document is touched.
 */
export function clearDeadAnchors(doc: TowerDoc): void {
  const defined = new Set<string>();
  for (const c of doc.chapters) {
    defined.add(c.id);
    for (const l of c.layers) {
      defined.add(l.id);
      for (const d of l.details ?? []) defined.add(d.id);
    }
  }
  const live = (a?: string) => (a !== undefined && defined.has(a) ? a : undefined);
  const ref = (r: NodeRef) => { r.anchor = live(r.anchor); };
  for (const c of doc.chapters) {
    for (const l of c.links) { ref(l.from); ref(l.to); }
    for (const l of c.layers) {
      for (const n of l.nodes) n.anchor = live(n.anchor);
      for (const d of l.details ?? []) {
        for (const e of [...d.incoming, ...d.outgoing]) ref(e.other);
        if (d.subTower) d.subTower.anchor = live(d.subTower.anchor);
      }
    }
  }
  for (const e of doc.toc) e.anchor = live(e.anchor);
}

/**
 * The document of one project. Every tower reachable from the root is a chapter at every level; the level
 * only sets the detail per element. Level 1: the layer map and the 3D view. Level 2: + node tables, charts
 * and connections. Level 3: + a detail per node, issues and the project files appendix. Level 4 (a
 * library) uses level 2 per project. `idPrefix` scopes every anchor to one project (see `scoped`). Same
 * input, same output: order follows the tower, sets are sorted.
 */
export function towerDoc(
  ws: Workspace, towerId: string, level: DocLevel, opts: { generator?: string; idPrefix?: string } = {},
): TowerDoc {
  const root = ws.towers[towerId];
  if (!root) throw new Error(`unknown tower: ${towerId}`);
  const { depths, limited } = printedTowers(ws, towerId);
  const detailLevel = level === 4 ? 2 : level;
  const usage: Usage = { types: new Set(), edgeKinds: new Set(), runtimes: new Map() };
  const scope: Scope = { ws, depths, level: detailLevel, usage, prefix: opts.idPrefix ?? '' };

  const chapters = [...depths.keys()].map((id) => chapterOf(ws.towers[id], scope));

  // One summary feeds the cover, the control block and the summary page, so every count agrees.
  const summary = docSummary(ws, towerId, depths);
  const { layers, nodes, agents, subTowers } = summary;
  const doc: TowerDoc = {
    title: root.name,
    description: root.description,
    towerId,
    level,
    generated: { tags: root.tags, counts: { layers, nodes, agents, subTowers } },
    control: {
      tower: root.name,
      source: towerId,
      generator: opts.generator ?? 'Flow Tower',
      level: LEVEL_NAMES[level],
      classification: classificationOf(ws, depths),
      layers,
      nodes,
      subTowers,
    },
    toc: tocOf(chapters),
    chapters,
    // Shown on the cover and the summary, so a cut-off document says so rather than looking complete.
    limitNote: limited ? `Stopped at ${MAX_TOWERS} towers: the project has more, and they are not printed.` : undefined,
  };
  if (detailLevel >= 2) {
    doc.summary = summary;
    doc.severities = severityCounts(root.issues);
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
  if (detailLevel === 3) {
    doc.findings = findingsOf(root.issues, root.name);
    doc.files = appendixFiles(ws, depths);
  }
  clearDeadAnchors(doc);
  return doc;
}
