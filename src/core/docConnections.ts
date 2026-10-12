import type { EdgeKind } from './schema.ts';
import type { ResolvedTower } from './types.ts';
import { nodeCode } from './docSummary.ts';

/*
 * The connection table and the fact strip of one layer, as plain data. A layer's table lists its own edges
 * first, then the cross-layer links that touch it, both in the tower's order. Kept apart from doc.ts so the
 * chapter builder stays a readable size, and so the counts can be tested without the DOM.
 */

/** One end of a connection: the node's code (N-Lxx.yy) and its name, as the table prints them. */
export interface EndRef {
  key: string;
  ref: string;
  label: string;
}

export interface ConnectionRow {
  from: EndRef;
  to: EndRef;
  kind: EdgeKind;
  label?: string;
}

export interface LayerFacts {
  nodes: number;
  agents: number;
  /** Edges that stay inside the layer. */
  internalEdges: number;
  /** Cross-layer links that enter the layer from another layer. */
  incoming: number;
  /** Cross-layer links that leave the layer for another layer. */
  outgoing: number;
  /** Distinct models the layer's nodes use: the node's own model, else its agent's. */
  models: number;
}

export interface LayerConnections {
  facts: LayerFacts;
  rows: ConnectionRow[];
}

/** The layer at `pos` in the tower's layer order. Refs are numbered by each node's own layer index. */
export function layerConnections(t: ResolvedTower, pos: number): LayerConnections {
  const layer = t.layers[pos];
  const inside = new Set(layer.nodes.map((n) => n.key));
  const ends = new Map<string, EndRef>();
  for (const l of t.layers) {
    l.nodes.forEach((n, i) => ends.set(n.key, { key: n.key, ref: nodeCode(l.index, i + 1), label: n.label }));
  }
  const endOf = (key: string): EndRef => ends.get(key) ?? { key, ref: '', label: key };

  const touching = t.links.filter((e) => inside.has(e.from) || inside.has(e.to));
  const models = new Set(layer.nodes.map((n) => n.model ?? n.agent?.model).filter((m): m is string => !!m));
  return {
    facts: {
      nodes: layer.nodes.length,
      agents: layer.nodes.filter((n) => n.agent).length,
      internalEdges: layer.edges.length,
      incoming: t.links.filter((e) => !inside.has(e.from) && inside.has(e.to)).length,
      outgoing: t.links.filter((e) => inside.has(e.from) && !inside.has(e.to)).length,
      models: models.size,
    },
    rows: [...layer.edges, ...touching].map((e) => ({
      from: endOf(e.from),
      to: endOf(e.to),
      kind: e.kind,
      label: e.label,
    })),
  };
}
