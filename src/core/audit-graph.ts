import type { ResolvedEdge, ResolvedNode } from './types.ts';

/**
 * Walks upstream from `key` to find what stands between a step and the world. Pure: same tower in,
 * same answer out. Used by AUD03 so a human two or three plumbing nodes back still counts as a gate.
 */

export type UpstreamGate = { kind: 'human' | 'guard'; node: string };

/**
 * Breadth-first walk backwards over incoming edges. A human (or any node with an approval) ends the
 * walk at once; a guard is remembered but the walk goes on, since a person may sit further up.
 */
export function upstreamGate(nodes: ResolvedNode[], edges: ResolvedEdge[], key: string): UpstreamGate | undefined {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const visited = new Set<string>([key]);
  const queue = [key];
  let guard: string | undefined;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    // Return edges carry an answer back to the caller; they are not a gate on what came before.
    for (const e of edges) {
      if (e.to !== cur || e.kind === 'return' || visited.has(e.from)) continue;
      visited.add(e.from);
      const p = byKey.get(e.from);
      if (!p) continue;
      // A person (or an explicit approval on the node) settles the question right here.
      if (p.type === 'human' || p.ops.approval !== undefined) return { kind: 'human', node: p.key };
      // A model can change what was approved upstream, so nothing behind it can be trusted as a gate.
      if (p.type === 'agent') continue;
      // A guard is code, not a person: keep it as a fallback and look for a human further up.
      if (p.type === 'guard') {
        guard ??= p.key;
      }
      queue.push(p.key);
    }
  }

  return guard !== undefined ? { kind: 'guard', node: guard } : undefined;
}
