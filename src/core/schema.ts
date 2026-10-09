import { z } from 'zod';

/** Visual + semantic node categories. Each one gets its own glyph in the tower. */
export const NODE_TYPES = [
  'entry', 'output', 'agent', 'process', 'decision', 'tool',
  'model', 'memory', 'human', 'guard', 'hook',
] as const;

/** Where something executes. Lets one tower mix local agents, servers and third-party services. */
export const RUNTIME_KINDS = [
  'local', 'server', 'cloud', 'container', 'serverless', 'saas', 'edge', 'ci', 'browser', 'device',
] as const;

/** Lifecycle of a node: shows structural changes that are planned, in trial or being removed. */
export const STATUSES = ['active', 'planned', 'experimental', 'deprecated'] as const;

export const RESOURCE_KINDS = ['log', 'script', 'dashboard', 'endpoint', 'config', 'doc', 'queue', 'database', 'repo', 'other'] as const;

/** How control or data moves along an edge. */
export const EDGE_KINDS = ['flow', 'call', 'spawn', 'handoff', 'return', 'data'] as const;

const id = z.string().regex(/^[A-Za-z0-9_-]+$/, 'ids may only contain letters, digits, "_" and "-"');
const meta = z.record(z.string(), z.unknown()).describe('Free-form key/value metadata shown in the inspector.');

export const RuntimeSchema = z.strictObject({
  kind: z.enum(RUNTIME_KINDS),
  label: z.string().optional(),
  description: z.string().optional(),
  host: z.string().optional().describe('Machine, cluster or service name.'),
  provider: z.string().optional().describe('aws, gcp, hetzner, anthropic, vercel, github-actions...'),
  region: z.string().optional(),
  url: z.string().regex(/^https?:\/\//, 'url must start with http:// or https://').optional(),
  meta: meta.optional(),
});

export const ResourceSchema = z.strictObject({
  kind: z.enum(RESOURCE_KINDS),
  label: z.string(),
  path: z.string().optional().describe('Local file, opens in the viewer (logs show their tail).'),
  url: z.string().regex(/^https?:\/\//, 'url must start with http:// or https://').optional().describe('External link, opens in a new tab.'),
}).refine((r) => !!r.path !== !!r.url, 'a resource needs exactly one of `path` or `url`');

export const PromptSchema = z.strictObject({
  file: z.string().optional().describe('Path to the prompt file, relative to `root`.'),
  text: z.string().optional().describe('Inline prompt text.'),
  description: z.string().optional(),
  vars: z.array(z.string()).optional().describe('Template variables. Auto-detected from {{var}} when omitted.'),
}).refine((p) => !!p.file !== !!p.text, 'a prompt needs exactly one of `file` or `text`');

/** A prompt reference: registry id, or an inline prompt definition. */
export const PromptRefSchema = z.union([z.string(), PromptSchema]);

export const AgentSchema = z.strictObject({
  from: z.string().optional().describe('Import a Claude Code style agent file (.md with YAML frontmatter). Explicit fields override it.'),
  name: z.string().optional(),
  description: z.string().optional(),
  model: z.string().optional(),
  prompt: PromptRefSchema.optional(),
  tools: z.array(z.string()).optional(),
  harness: meta.optional().describe('Runtime settings: max_turns, temperature, permission_mode, budget...'),
  files: z.array(z.string()).optional(),
  tower: z.string().optional().describe('Path to a nested .tower.yaml describing this agent internals.'),
  runtime: z.string().optional().describe('Reference to an entry of the `runtimes` registry.'),
  resources: z.array(ResourceSchema).optional(),
  meta: meta.optional(),
});

export const NodeSchema = z.strictObject({
  id,
  type: z.enum(NODE_TYPES).optional().describe('Defaults to `agent` when `agent` is set, else `process`.'),
  label: z.string().optional(),
  description: z.string().optional(),
  agent: z.string().optional().describe('Reference to an entry of the `agents` registry.'),
  model: z.string().optional(),
  prompt: PromptRefSchema.optional(),
  tools: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  tower: z.string().optional(),
  runtime: z.string().optional().describe('Reference to `runtimes`. Inherited from the agent when omitted.'),
  status: z.enum(STATUSES).optional().describe('Defaults to `active`.'),
  resources: z.array(ResourceSchema).optional().describe('Logs, scripts, dashboards, endpoints... related to this node.'),
  meta: meta.optional(),
});

export const EdgeObjectSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  kind: z.enum(EDGE_KINDS).default('flow'),
  label: z.string().optional(),
  condition: z.string().optional(),
});

/** Shorthand: "a -> b", "a -> b: label", "a -> b [spawn]: label". */
export const EdgeSchema = z.union([z.string(), EdgeObjectSchema]);

export const LayerSchema = z.strictObject({
  id,
  title: z.string(),
  description: z.string().optional(),
  nodes: z.array(NodeSchema).min(1),
  edges: z.array(EdgeSchema).default([]),
});

export const TowerSchema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1).default(1),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]).describe('Used to filter and group towers in the library view.'),
  root: z.string().optional().describe('Base directory for every relative path. Defaults to the tower file directory.'),
  runtimes: z.record(id, RuntimeSchema).default({}),
  prompts: z.record(id, PromptSchema).default({}),
  agents: z.record(id, AgentSchema).default({}),
  layers: z.array(LayerSchema).min(1).describe('Ordered top to bottom.'),
  links: z.array(EdgeSchema).default([]).describe('Cross-layer edges, endpoints written as "layer.node".'),
});

export type NodeType = (typeof NODE_TYPES)[number];
export type RuntimeKind = (typeof RUNTIME_KINDS)[number];
export type Status = (typeof STATUSES)[number];
export type RuntimeDef = z.infer<typeof RuntimeSchema>;
export type ResourceDef = z.infer<typeof ResourceSchema>;
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type PromptDef = z.infer<typeof PromptSchema>;
export type PromptRef = z.infer<typeof PromptRefSchema>;
export type AgentDef = z.infer<typeof AgentSchema>;
export type NodeDef = z.infer<typeof NodeSchema>;
export type EdgeDef = z.infer<typeof EdgeSchema>;
export type TowerDef = z.infer<typeof TowerSchema>;
