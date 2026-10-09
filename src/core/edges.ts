import { EDGE_KINDS, type EdgeDef, type EdgeKind, type Protocol } from './schema.ts';

export interface ParsedEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  condition?: string;
  protocol?: Protocol;
}

// "a -> b", "a -> b: label", "a -> b [spawn]", "a -> b [spawn]: label"
const SHORTHAND = /^\s*([\w.-]+?)\s*->\s*([\w.-]+)\s*(?:\[\s*(\w+)\s*\])?\s*(?::\s*(.+?))?\s*$/;

/** Parses an edge in shorthand or object form. Returns an error string when malformed. */
export function parseEdge(edge: EdgeDef): ParsedEdge | string {
  if (typeof edge !== 'string') return { ...edge, kind: edge.kind ?? 'flow' };
  const m = SHORTHAND.exec(edge);
  if (!m) return `malformed edge "${edge}" (expected "from -> to [kind]: label")`;
  const [, from, to, kind = 'flow', label] = m;
  if (!(EDGE_KINDS as readonly string[]).includes(kind)) {
    return `unknown edge kind "${kind}" in "${edge}" (use one of ${EDGE_KINDS.join(', ')})`;
  }
  return { from, to, kind: kind as EdgeKind, label };
}
