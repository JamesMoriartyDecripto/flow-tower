import type { ResolvedEdge, ResolvedNode, ResolvedRuntime, ResolvedTower, Workspace } from './types.ts';
import { fieldsOf, formatValue, type Field } from './docFields.ts';
import type { NodeDetail, NodeRef } from './doc.ts';

/*
 * The level-3 node sheet as plain data: one NodeDetail per resolved node. Kept apart from doc.ts so the
 * chapter builder stays a readable size. The anchors come from doc.ts (they name the links), so this file
 * only builds the shape; it never invents an id of its own.
 */

/** What one node sheet needs: the workspace (for sub-tower names and counts), the printed depths and the anchors. */
export interface DetailScope {
  ws: Workspace;
  depths: Map<string, number>;
  anchorOf: (towerId: string, key: string) => string;
  towerAnchorOf: (towerId: string) => string;
}

/** Strips whitespace runs to one space, the way the view prints prose. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Operational facts that are set, in the schema's own order. Values are never cut: a field must reach print. */
function opsFields(ops: Record<string, unknown>): Field[] {
  return fieldsOf(ops);
}

/**
 * A runtime's facts except its label and id, which the node already names. Unset keys are dropped by
 * `fieldsOf`, so a runtime with only a kind prints one line.
 */
function runtimeFields(r: ResolvedRuntime): Record<string, unknown> {
  const { id: _id, label: _label, description: _description, meta: _meta, ...facts } = r;
  return facts;
}

/** The node's own model, else its agent's: a model node has no agent but still names its model. */
const modelOf = (n: ResolvedNode) => n.model ?? n.agent?.model;

/** The node's own prompt source, else its agent's: a node without an agent still names its prompt. */
const promptOf = (n: ResolvedNode) => n.prompt?.source ?? n.agent?.prompt?.source;

/** The sub-tower a node opens: its name, its link if printed, and its counts so a reader sees its size. */
function subTowerOf(scope: DetailScope, n: ResolvedNode): NodeDetail['subTower'] {
  if (!n.tower) return undefined;
  const sub = scope.ws.towers[n.tower];
  return {
    id: n.tower,
    title: sub?.name ?? n.tower,
    // Only a tower that is printed has a chapter to link to; a deeper one is named, not linked.
    anchor: scope.depths.has(n.tower) ? scope.towerAnchorOf(n.tower) : undefined,
    layers: sub?.layers.length ?? 0,
    nodes: sub?.layers.reduce((s, l) => s + l.nodes.length, 0) ?? 0,
  };
}

/** One node's sheet: every field a reader needs, with the edges on both sides, as the view prints them. */
export function nodeDetail(
  t: ResolvedTower, n: ResolvedNode, ref: string, allEdges: ResolvedEdge[],
  nodeRef: (key: string) => NodeRef, scope: DetailScope,
): NodeDetail {
  const model = modelOf(n);
  const prompt = promptOf(n);
  return {
    id: scope.anchorOf(t.id, n.key),
    ref,
    key: n.key,
    label: n.label,
    type: n.type,
    status: n.status,
    description: n.description ? collapse(n.description) : undefined,
    agent: n.agent ? { name: n.agent.name, model, prompt } : undefined,
    model,
    prompt,
    tools: n.tools,
    runtime: n.runtime?.label ?? n.runtime?.id,
    // The runtime's kind and host are facts a reader checks against the node, so they are printed too.
    runtimeFacts: n.runtime ? fieldsOf(runtimeFields(n.runtime)) : [],
    resources: n.resources.length ? [{ label: 'Resources', value: formatValue('resources', n.resources) }] : [],
    ops: opsFields(n.ops as Record<string, unknown>),
    incoming: allEdges.filter((e) => e.to === n.key).map((e) => ({ label: e.label, kind: e.kind, other: nodeRef(e.from) })),
    outgoing: allEdges.filter((e) => e.from === n.key).map((e) => ({ label: e.label, kind: e.kind, other: nodeRef(e.to) })),
    files: n.files,
    subTower: subTowerOf(scope, n),
  };
}
