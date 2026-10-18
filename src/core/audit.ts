import { NO_CONTEXT, type AuditContext } from './audit-context.ts';
import { upstreamGate } from './audit-graph.ts';
import type { ResolvedEdge, ResolvedNode, ResolvedTower, Workspace } from './types.ts';

/**
 * Tower audit: phase 2 (inventory) and phase 3a (lint) of the optimizer flow. Pure and deterministic:
 * no model, only facts read from the resolved tower. Same tower in, same output out, so the
 * optimizer can diff two audits and the docs can link to the rule ids.
 */

export const RULES = {
  AUD01: 'agent loops on itself (or an agent cycle) with no budget or limits',
  AUD02: 'fan-out or several spawns with no limits',
  AUD03: 'exactly-once, irreversible, sensitive or user-credential node with no approval and no human before it',
  AUD04: 'decision node with fewer than 2 outgoing edges, or no decision.fail',
  AUD05: 'agent feeds an output directly with no evals on it or on a guard between them',
  AUD06: 'node with more than 15 tools',
  AUD07: 'node with no outgoing edge that is not a call target',
  AUD08: 'nested towers deeper than 3 levels',
  AUD09: 'agent node with no model',
  AUD10: 'tower with 3+ agents and no tower-level budget or limits',
  AUD11: 'shell or code-execution tool with no sandbox',
} as const;

export type RuleId = keyof typeof RULES;

export interface Finding {
  rule: RuleId;
  level: 'warning' | 'info';
  /** Node key ("layer.node"); absent for tower-level findings. */
  node?: string;
  message: string;
}

export interface Inventory {
  layers: number;
  nodes: number;
  nodesByType: Record<string, number>;
  edges: { total: number; links: number; byKind: Record<string, number> };
  agents: number;
  models: Record<string, number>;
  runtimes: { declared: number; byKind: Record<string, number> };
  withOps: { budget: number; limits: number; approval: number; evals: number; sandbox: number; fanout: number };
  nestedTowers: string[];
  run: { budget: boolean; limits: boolean };
}

/** Tool names (after an optional "Name(args)" or "mcp__server__") that run arbitrary code on the host. */
const SHELL_TOOLS = new Set(['bash', 'shell', 'exec', 'terminal', 'code_interpreter', 'python', 'run_command', 'computer']);
/** A cycle through these edges is a loop of work; `data` only moves a value, so it cannot loop control. */
const LOOP_KINDS = new Set(['spawn', 'handoff', 'call', 'return', 'flow']);
/** Node types that do work and so need an outgoing edge (or be called) to be useful. */
const WORK_TYPES = new Set(['entry', 'agent', 'process', 'decision', 'human', 'guard']);
const MAX_TOOLS = 15;
const SENSITIVE = ['pci', 'secret'];

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function countBy(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return sortKeys(out);
}

const nodesOf = (t: ResolvedTower): ResolvedNode[] => t.layers.flatMap((l) => l.nodes);
const edgesOf = (t: ResolvedTower): ResolvedEdge[] => [...t.layers.flatMap((l) => l.edges), ...t.links];

/** Plain counts, JSON-serialisable, keys sorted (order carries no meaning). */
export function inventory(tower: ResolvedTower): Inventory {
  const nodes = nodesOf(tower);
  const edges = edgesOf(tower);
  const has = (v: unknown) => v !== undefined;
  return {
    layers: tower.layers.length,
    nodes: nodes.length,
    nodesByType: countBy(nodes.map((n) => n.type)),
    edges: {
      total: edges.length,
      links: tower.links.length,
      byKind: countBy(edges.map((e) => e.kind)),
    },
    agents: nodes.filter((n) => n.type === 'agent').length,
    models: countBy(nodes.map((n) => n.model).filter((m): m is string => !!m)),
    runtimes: {
      declared: Object.keys(tower.runtimes).length,
      byKind: countBy(Object.values(tower.runtimes).map((r) => r.kind)),
    },
    withOps: {
      budget: nodes.filter((n) => has(n.ops.budget)).length,
      limits: nodes.filter((n) => has(n.ops.limits)).length,
      approval: nodes.filter((n) => has(n.ops.approval)).length,
      evals: nodes.filter((n) => n.ops.evals !== undefined && n.ops.evals.length > 0).length,
      sandbox: nodes.filter((n) => has(n.ops.sandbox)).length,
      fanout: nodes.filter((n) => has(n.ops.fanout)).length,
    },
    nestedTowers: nodes.filter((n) => n.tower).map((n) => n.key).sort(),
    run: { budget: has(tower.run?.budget), limits: has(tower.run?.limits) },
  };
}

/** Lint findings, ordered by rule id, then node key. Stable: same tower, same list. */
export function auditTower(tower: ResolvedTower, ctx: AuditContext = NO_CONTEXT): Finding[] {
  const nodes = nodesOf(tower);
  const edges = edgesOf(tower);
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const outOf = (key: string) => edges.filter((e) => e.from === key);
  const inOf = (key: string) => edges.filter((e) => e.to === key);
  // A sub-tower runs inside its parents' run, so their budget or limits count here too.
  const runBudget = tower.run?.budget !== undefined || ctx.runBudget;
  const runLimits = tower.run?.limits !== undefined || ctx.runLimits;
  const findings: Finding[] = [];
  const add = (rule: RuleId, level: Finding['level'], message: string, node?: string) => {
    findings.push({ rule, level, node, message });
  };

  // Agent-only subgraph of loop-capable edges, used to find cycles.
  const agentKeys = new Set(nodes.filter((n) => n.type === 'agent').map((n) => n.key));
  const loopEdges = edges.filter((e) => LOOP_KINDS.has(e.kind) && agentKeys.has(e.from) && agentKeys.has(e.to));
  /** True when `key` can reach itself through loop edges (a self-loop included). */
  const onAgentCycle = (key: string) => {
    const seen = new Set<string>();
    const queue = [key];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of loopEdges) {
        if (e.from !== cur) continue;
        if (e.to === key) return true;
        if (!seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
    return false;
  };

  for (const n of nodes) {
    const key = n.key;
    const outs = outOf(key);
    const ins = inOf(key);
    const hasLimits = n.ops.limits !== undefined || runLimits;
    const spawns = outs.filter((e) => e.kind === 'spawn').length;

    // AUD01: an agent that can loop with nothing to stop it runs up cost unbounded.
    if (n.type === 'agent' && onAgentCycle(key) && n.ops.budget === undefined && n.ops.limits === undefined && !runBudget && !runLimits) {
      add('AUD01', 'warning', 'loops with no budget or limits: add limits.max_iterations or a budget', key);
    }

    // AUD02: parallel copies or many spawns multiply cost and load; bound them.
    if ((n.ops.fanout !== undefined || spawns >= 2) && !hasLimits) {
      add('AUD02', 'warning', 'fan-out with no limits: add limits.concurrency or limits.timeout', key);
    }

    // AUD03: a sensitive or irreversible step needs a person in the loop, either as a gate on the
    // node or as a human upstream. The human node itself is the gate, so it is exempt.
    const effect = n.ops.effect;
    // A read or reversible step can be undone, so sensitivity or user credentials alone do not gate it.
    const lifted = effect === 'read' || effect === 'reversible';
    // A guard is the control itself and a memory store does not act, so neither is gated for its data.
    const holder = n.type === 'guard' || n.type === 'memory';
    const sensitive = SENSITIVE.includes(n.ops.data?.sensitivity ?? '');
    const needsGate = n.ops.exactly_once === true || effect === 'irreversible' || ((sensitive || n.ops.credentials === 'user') && !holder && !lifted);
    if (n.type !== 'human' && needsGate && n.ops.approval === undefined) {
      const gate = upstreamGate(nodes, edges, key);
      // An entry of a sub-tower opened after a human approval is gated by that approval, even though
      // the approval sits in the parent tower, not in this one.
      const inheritedGate = ctx.gated && n.type === 'entry';
      if (gate?.kind === 'guard') {
        add('AUD03', 'info', `gated by code (${gate.node}), not a person: fine when the guard covers the risk, else add approval`, key);
      } else if (gate?.kind !== 'human' && !inheritedGate) {
        add('AUD03', 'warning', 'sensitive or exactly-once step with no approval: add approval (or a human node before it)', key);
      }
    }

    // AUD04: a decision must branch on every answer and say what happens on error.
    if (n.type === 'decision' && outs.length < 2) {
      add('AUD04', 'warning', `decision with ${outs.length} outgoing edge(s): add one edge per answer`, key);
    }
    if (n.ops.decision !== undefined && n.ops.decision.fail === undefined) {
      add('AUD04', 'warning', 'decision with no fail: set decision.fail to open or closed', key);
    }

    // AUD05: an agent whose answer goes straight to the user should be measured. A guard between
    // them counts only when the guard carries the evals.
    if (n.type === 'agent' && outs.some((e) => byKey.get(e.to)?.type === 'output')) {
      const ownEvals = n.ops.evals !== undefined && n.ops.evals.length > 0;
      const guarded = outs.some((e) => {
        const g = byKey.get(e.to);
        return g?.type === 'guard' && g.ops.evals !== undefined && g.ops.evals.length > 0
          && outOf(g.key).some((o) => byKey.get(o.to)?.type === 'output');
      });
      if (!ownEvals && !guarded) add('AUD05', 'info', 'feeds output with no evals: add evals to measure the answer', key);
    }

    // AUD06: a long tool list makes the agent choose badly; split the job.
    if (n.tools.length > MAX_TOOLS) {
      add('AUD06', 'info', `${n.tools.length} tools: split the job across agents`, key);
    }

    // AUD07: a working node that leads nowhere is a dead end, unless it is a called subroutine.
    const isCalled = ins.some((e) => e.kind === 'call');
    if (WORK_TYPES.has(n.type) && outs.length === 0 && !isCalled) {
      add('AUD07', 'info', 'no outgoing edge: connect it, or make it the target of a call', key);
    }

    // AUD09: an agent without a model has no defined behaviour.
    if (n.type === 'agent' && n.model === undefined) {
      add('AUD09', 'info', 'no model: set model on the node or its agent', key);
    }

    // AUD11: code execution on the host without a sandbox.
    const risky = n.tools.some((t) => SHELL_TOOLS.has(toolBase(t)));
    if (risky && n.ops.sandbox === undefined) {
      add('AUD11', 'warning', 'shell or code tool with no sandbox: add sandbox (network, filesystem)', key);
    }
  }

  // AUD10: a multi-agent system needs a whole-run budget or limits.
  const agents = nodes.filter((n) => n.type === 'agent').length;
  if (agents >= 3 && !runBudget && !runLimits) {
    add('AUD10', 'info', `${agents} agents with no tower budget or limits: add a run-wide budget`);
  }

  return findings.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : (a.node ?? '') < (b.node ?? '') ? -1 : (a.node ?? '') > (b.node ?? '') ? 1 : 0));
}

/**
 * AUD08: nested towers go through `node.tower` (the loader folds `agent.tower` into it, as the app
 * does). The root is level 1; a node that opens level 4 gets a finding, so one finding per too-deep
 * branch, not one per deeper level. `workspace` is the loaded set, looked up by tower id; a tower
 * that is missing or already on the path is skipped, so a cycle of references ends.
 */
export function auditNesting(workspace: Workspace, rootId: string): Finding[] {
  const findings: Finding[] = [];
  const MAX_DEPTH = 3;
  const walk = (towerId: string, depth: number, path: string[]) => {
    const tower = workspace.towers[towerId];
    if (!tower) return;
    for (const n of nodesOf(tower)) {
      if (!n.tower || path.includes(n.tower)) continue;
      if (depth + 1 > MAX_DEPTH) {
        findings.push({ rule: 'AUD08', level: 'info', node: n.key, message: `nested tower deeper than ${MAX_DEPTH} levels: flatten it or split the job` });
        continue;
      }
      walk(n.tower, depth + 1, [...path, n.tower]);
    }
  };
  if (workspace.towers[rootId]) walk(rootId, 1, [rootId]);
  return findings.sort((a, b) => ((a.node ?? '') < (b.node ?? '') ? -1 : (a.node ?? '') > (b.node ?? '') ? 1 : 0));
}

/** "Bash(git:*)" → "bash", "mcp__box__shell" → "shell". Compared lowercase against SHELL_TOOLS. */
function toolBase(name: string): string {
  return name.toLowerCase().split('(')[0].split('__').pop() ?? '';
}
