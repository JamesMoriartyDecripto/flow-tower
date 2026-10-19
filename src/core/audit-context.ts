import { upstreamGate } from './audit-graph.ts';
import type { ResolvedEdge, ResolvedNode, ResolvedTower, Workspace } from './types.ts';

/**
 * What a sub-tower inherits from the towers that open it. A sub-tower is run by its parent, so a
 * run budget, limits or a human gate set above it still holds for the sub-tower's own nodes. Pure:
 * same workspace in, same answer out.
 */
export interface AuditContext {
  runBudget: boolean;
  runLimits: boolean;
  gated: boolean;
}

export const NO_CONTEXT: AuditContext = { runBudget: false, runLimits: false, gated: false };

interface Parent {
  towerId: string;
  tower: ResolvedTower;
  node: ResolvedNode;
}

const nodesOf = (t: ResolvedTower): ResolvedNode[] => t.layers.flatMap((l) => l.nodes);
const edgesOf = (t: ResolvedTower): ResolvedEdge[] => [...t.layers.flatMap((l) => l.edges), ...t.links];

/** Every node, in any tower, that opens `towerId` through its `tower` field. */
function parentsOf(workspace: Workspace, towerId: string): Parent[] {
  const out: Parent[] = [];
  for (const [id, tower] of Object.entries(workspace.towers)) {
    for (const node of nodesOf(tower)) {
      if (node.tower === towerId) out.push({ towerId: id, tower, node });
    }
  }
  return out;
}

/**
 * True when `towerId` runs under a run-wide value set by `pick`: its own tower sets it, or every
 * parent is covered in turn. The path guards against a cycle of references: a tower met again on
 * the same path is not counted as covered, since that would be reasoning in a circle.
 */
function covered(workspace: Workspace, towerId: string, pick: (t: ResolvedTower) => boolean, path: string[]): boolean {
  const tower = workspace.towers[towerId];
  if (!tower || path.includes(towerId)) return false;
  if (pick(tower)) return true;
  const parents = parentsOf(workspace, towerId);
  const next = [...path, towerId];
  return parents.length > 0 && parents.every((p) => covered(workspace, p.towerId, pick, next));
}

/**
 * The context a tower is audited in. A root tower (no parent) gets NO_CONTEXT. Every parent must
 * cover the value: one unbudgeted root means the sub-tower can run unbounded from there.
 */
export function auditContext(workspace: Workspace, towerId: string): AuditContext {
  const parents = parentsOf(workspace, towerId);
  if (parents.length === 0) return NO_CONTEXT;

  const runBudget = parents.every((p) => covered(workspace, p.towerId, (t) => t.run?.budget !== undefined, [towerId]));
  const runLimits = parents.every((p) => covered(workspace, p.towerId, (t) => t.run?.limits !== undefined, [towerId]));
  // One level only: a human gate on the node that opens the tower, or a human upstream of it in its own tower.
  const gated = parents.every((p) => {
    if (p.node.ops.approval !== undefined || p.node.type === 'human') return true;
    const gate = upstreamGate(nodesOf(p.tower), edgesOf(p.tower), p.node.key);
    return gate?.kind === 'human';
  });
  return { runBudget, runLimits, gated };
}
