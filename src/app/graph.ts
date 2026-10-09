import type { ResolvedEdge, ResolvedNode, ResolvedTower } from '../core/types';

export const allEdges = (t: ResolvedTower): ResolvedEdge[] => [...t.layers.flatMap((l) => l.edges), ...t.links];

/** Every node and edge reachable upstream and downstream of `key`. */
export function related(tower: ResolvedTower, key: string): { nodes: Set<string>; edges: Set<string> } {
  const edges = allEdges(tower);
  const nodes = new Set([key]);
  const hit = new Set<string>();
  const walk = (dir: 'from' | 'to') => {
    const other = dir === 'from' ? 'to' : 'from';
    const queue = [key];
    const seen = new Set([key]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of edges) {
        if (e[dir] !== cur) continue;
        hit.add(e.id);
        if (!seen.has(e[other])) { seen.add(e[other]); nodes.add(e[other]); queue.push(e[other]); }
      }
    }
  };
  walk('from');
  walk('to');
  return { nodes, edges: hit };
}

export function neighbours(tower: ResolvedTower, key: string) {
  const edges = allEdges(tower);
  return {
    incoming: edges.filter((e) => e.to === key),
    outgoing: edges.filter((e) => e.from === key),
  };
}

export function matches(node: ResolvedNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [node.label, node.id, node.type, node.model, node.description, ...node.tools]
    .some((v) => v?.toLowerCase().includes(q));
}
