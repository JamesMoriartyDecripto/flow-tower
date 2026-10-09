import type { EdgeKind, NodeType, OpsDef, Protocol, ResourceDef, RuntimeDef, Status } from './schema.ts';

/** Fully resolved data sent to the browser. Every reference is already expanded. */

export interface ResolvedPrompt {
  id?: string;
  text: string;
  source?: string;
  description?: string;
  vars: string[];
  tokens: number;
}

export interface ResolvedRuntime extends RuntimeDef {
  id: string;
}

export interface ResolvedAgent {
  id: string;
  name: string;
  description?: string;
  model?: string;
  prompt?: ResolvedPrompt;
  tools: string[];
  harness: Record<string, unknown>;
  skills: string[];
  disabledTools: string[];
  files: string[];
  source?: string;
  tower?: string;
  runtime?: string;
  resources: ResourceDef[];
  match?: string[];
  ops: OpsDef;
  meta: Record<string, unknown>;
}

export interface ResolvedNode {
  id: string;
  /** Globally unique inside a tower: "layer.node". */
  key: string;
  layer: string;
  type: NodeType;
  label: string;
  description?: string;
  agent?: ResolvedAgent;
  model?: string;
  prompt?: ResolvedPrompt;
  tools: string[];
  files: string[];
  tower?: string;
  runtime?: ResolvedRuntime;
  status: Status;
  resources: ResourceDef[];
  match?: string[];
  /** Operational facts (trigger, approval, budget, limits, fan-out, data, evals...), node over agent. */
  ops: OpsDef;
  meta: Record<string, unknown>;
}

export interface ResolvedEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  condition?: string;
  protocol?: Protocol;
  /** Fire-and-forget: the source does not wait. */
  async?: boolean;
  /** Alternatives: edges from one node sharing a group, exactly one is taken. */
  group?: string;
  version?: string;
  card?: string;
}

export interface ResolvedLayer {
  id: string;
  index: number;
  title: string;
  description?: string;
  nodes: ResolvedNode[];
  edges: ResolvedEdge[];
}

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  message: string;
  path?: string;
}

export interface ResolvedTower {
  /** Path of the tower file relative to the workspace root (used as id). */
  id: string;
  name: string;
  description?: string;
  tags: string[];
  /** Last modification of the tower file (ISO), for sorting the library. */
  updatedAt?: string;
  runtimes: Record<string, ResolvedRuntime>;
  /** Run-wide budget and limits (the whole system, across nodes). */
  run?: { budget?: OpsDef['budget']; limits?: OpsDef['limits'] };
  layers: ResolvedLayer[];
  links: ResolvedEdge[];
  issues: Issue[];
}

export interface Workspace {
  /** Top-level towers (projects) shown in the library; nested towers are reachable from them. */
  projects: string[];
  towers: Record<string, ResolvedTower>;
  loadedAt: string;
}
