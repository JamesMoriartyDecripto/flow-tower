import { NODE_TYPES, SENSITIVITY, STATUSES, type NodeType, type Status } from './schema.ts';
import type { Workspace } from './types.ts';
import { fieldsOf, type Field } from './docFields.ts';

/*
 * Counts and classification of one tower's document, as plain data. The summary page, the control block
 * and the chapters all read these, so a number printed on the cover cannot disagree with the node tables.
 * Kept apart from doc.ts (which holds the chapters) so each file stays a readable size.
 */

/**
 * Hard safety limit on the towers one document prints. A project is meant to be small; the limit only
 * stops a runaway workspace, and the document says so when it is hit.
 */
export const MAX_TOWERS = 50;

/**
 * Every tower reachable from the root, with its depth from the root, in discovery order (root first, then
 * its nested towers, layer by layer). A map keeps each tower once, so a cycle stops at the second visit.
 * `limit` caps the number of towers returned; the walk stops there.
 */
export function includedTowers(ws: Workspace, rootId: string, limit = Infinity): Map<string, number> {
  const depths = new Map<string, number>([[rootId, 0]]);
  // A Map iterator also visits the entries added while looping: this is a breadth-first walk.
  for (const [id, depth] of depths) {
    for (const layer of ws.towers[id]?.layers ?? []) {
      for (const n of layer.nodes) {
        if (depths.size >= limit) return depths;
        if (n.tower && ws.towers[n.tower] && !depths.has(n.tower)) depths.set(n.tower, depth + 1);
      }
    }
  }
  return depths;
}

/**
 * The towers one document prints: every tower reachable from the root, up to MAX_TOWERS. Past the limit the
 * extra towers are dropped and `limited` says so, so the document can state it rather than hide it.
 */
export function printedTowers(ws: Workspace, rootId: string): { depths: Map<string, number>; limited: boolean } {
  // One tower past the limit is walked, so a workspace of exactly MAX_TOWERS towers is not reported as cut.
  const all = includedTowers(ws, rootId, MAX_TOWERS + 1);
  if (all.size <= MAX_TOWERS) return { depths: all, limited: false };
  return { depths: new Map([...all].slice(0, MAX_TOWERS)), limited: true };
}

/**
 * `N-L01.03`: the layer's code and the node's 1-based position in it. A node has one code in the
 * document, so a finding or a table row can name it without a line number.
 */
export function nodeCode(layerIndex: number, position: number): string {
  return `N-L${pad2(layerIndex + 1)}.${pad2(position)}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The classification line of the document. The schema's sensitivity list runs from least to most
 * sensitive, so the highest one declared on any printed node wins. Nothing declared: `Internal`, the
 * default. Declared: upper case, as the footer prints it.
 */
export function classificationOf(ws: Workspace, depths: Map<string, number>): string {
  let best = -1;
  for (const id of depths.keys()) {
    for (const l of ws.towers[id].layers) {
      for (const n of l.nodes) {
        const s = n.ops.data?.sensitivity;
        if (!s) continue;
        const rank = SENSITIVITY.indexOf(s);
        if (rank > best) best = rank;
      }
    }
  }
  return best < 0 ? 'Internal' : SENSITIVITY[best].toUpperCase();
}

export interface ModelUse { model: string; nodes: number }

export interface Validation {
  /** PASS when no error or warning, else the worse of the two with its count. Info alone is a PASS. */
  verdict: 'PASS' | 'WARNINGS' | 'ERRORS';
  count: number;
  errors: number;
  warnings: number;
  info: number;
}

export interface DocSummary {
  layers: number;
  nodes: number;
  agents: number;
  /** Nodes of type `human`, or any node with an approval gate. */
  humans: number;
  subTowers: number;
  byType: { type: NodeType; nodes: number }[];
  byStatus: { status: Status; nodes: number }[];
  /** Models in use, most nodes first. A node without a model is not counted here. */
  models: ModelUse[];
  validation: Validation;
  /** The root tower's run-wide budget and limits, formatted for print (see docFields.ts). */
  budget: Field[];
}

/**
 * Every count the summary page prints, over the towers the document prints (`depths`: the same towers the
 * chapters print). Validation counts the root's issues, as the issues block does.
 */
export function docSummary(ws: Workspace, towerId: string, depths: Map<string, number>): DocSummary {
  const root = ws.towers[towerId];
  if (!root) throw new Error(`unknown tower: ${towerId}`);

  const byType = new Map<NodeType, number>();
  const byStatus = new Map<Status, number>();
  const models = new Map<string, number>();
  let layers = 0;
  let nodes = 0;
  let agents = 0;
  let humans = 0;
  for (const id of depths.keys()) {
    for (const l of ws.towers[id].layers) {
      layers++;
      for (const n of l.nodes) {
        nodes++;
        if (n.agent) agents++;
        if (n.type === 'human' || n.ops.approval) humans++;
        byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
        byStatus.set(n.status, (byStatus.get(n.status) ?? 0) + 1);
        const model = n.model ?? n.agent?.model;
        if (model) models.set(model, (models.get(model) ?? 0) + 1);
      }
    }
  }

  const count = (level: string) => root.issues.filter((i) => i.level === level).length;
  const errors = count('error');
  const warnings = count('warning');
  const validation: Validation = errors > 0
    ? { verdict: 'ERRORS', count: errors, errors, warnings, info: count('info') }
    : warnings > 0
      ? { verdict: 'WARNINGS', count: warnings, errors, warnings, info: count('info') }
      : { verdict: 'PASS', count: 0, errors, warnings, info: count('info') };

  return {
    layers,
    nodes,
    agents,
    humans,
    subTowers: depths.size - 1,
    byType: NODE_TYPES.filter((t) => byType.has(t)).map((type) => ({ type, nodes: byType.get(type)! })),
    byStatus: STATUSES.filter((s) => byStatus.has(s)).map((status) => ({ status, nodes: byStatus.get(status)! })),
    models: [...models.entries()]
      .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
      .map(([model, n]) => ({ model, nodes: n })),
    validation,
    budget: root.run ? fieldsOf({ budget: root.run.budget, limits: root.run.limits }) : [],
  };
}

/**
 * JSON with every object's keys sorted, so the same tower always serialises to the same text. The control
 * block's fingerprint is a hash of this text; key order in the source files must not change it.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  }
  return v;
}
