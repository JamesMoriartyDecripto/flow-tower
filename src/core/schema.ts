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

export const RESOURCE_KINDS = ['log', 'script', 'dashboard', 'endpoint', 'config', 'doc', 'queue', 'database', 'repo', 'recording', 'other'] as const;

/** How control or data moves along an edge. */
export const EDGE_KINDS = ['flow', 'call', 'spawn', 'handoff', 'return', 'data'] as const;

/** Wire protocol of an edge, when it matters (agents of different vendors, queues, webhooks). */
export const PROTOCOLS = ['mcp', 'a2a', 'http', 'grpc', 'webhook', 'queue', 'event', 'stdio'] as const;

export const TRIGGER_KINDS = ['manual', 'cron', 'webhook', 'event', 'queue', 'chat', 'email', 'file'] as const;
export const SENSITIVITY = ['public', 'internal', 'confidential', 'pii', 'phi', 'pci', 'secret'] as const;
export const ROLLOUTS = ['all', 'canary', 'ab', 'shadow', 'blue-green', 'rainbow'] as const;
export const CREDENTIALS = ['service', 'author', 'user'] as const;
export const NETWORK = ['none', 'allowlist', 'open'] as const;

const id = z.string().regex(/^[A-Za-z0-9_-]+$/, 'ids may only contain letters, digits, "_" and "-"');
const meta = z.record(z.string(), z.unknown()).describe('Free-form key/value metadata shown in the inspector.');
/** "90s", "5m", "72h", "7d", "250ms". */
const duration = z.string().regex(/^\d+(\.\d+)?(ms|s|m|h|d|w)$/, 'durations look like 250ms, 90s, 5m, 72h, 7d, 2w');

export const TriggerSchema = z.strictObject({
  kind: z.enum(TRIGGER_KINDS),
  schedule: z.string().optional().describe('Cron expression for `cron` (e.g. "0 9 * * 1-5").'),
  source: z.string().optional().describe('Who fires it: PagerDuty, Gmail, a queue name, a Slack channel...'),
  description: z.string().optional(),
});

export const ApprovalSchema = z.strictObject({
  by: z.string().optional().describe('Role or person who approves.'),
  actions: z.array(z.enum(['approve', 'edit', 'reject', 'respond', 'snooze'])).optional(),
  timeout: duration.optional(),
  on_timeout: z.enum(['approve', 'reject', 'escalate', 'wait']).optional(),
  via: z.string().optional().describe('Slack, email, PR review, app...'),
});

export const BudgetSchema = z.strictObject({
  usd: z.number().positive().optional(),
  tokens: z.number().int().positive().optional(),
  turns: z.number().int().positive().optional(),
  on_exceed: z.enum(['pause', 'stop', 'escalate', 'downgrade']).optional(),
});

export const LimitsSchema = z.strictObject({
  timeout: duration.optional(),
  ttl: duration.optional().describe('Lifetime of a session / sandbox / browser.'),
  retries: z.number().int().min(0).optional(),
  backoff: z.string().optional().describe('e.g. "exponential 2s..60s".'),
  max_iterations: z.number().int().positive().optional().describe('Bound for loops (review rounds, tournament rounds...).'),
  concurrency: z.number().int().positive().optional(),
});

/** Parallel copies of this node: a number, or a range when it scales with the task. */
export const FanoutSchema = z.union([
  z.number().int().min(2),
  z.strictObject({ min: z.number().int().min(1).optional(), max: z.number().int().min(2), by: z.string().optional().describe('What decides the count.') }),
]);

export const DataSchema = z.strictObject({
  sensitivity: z.enum(SENSITIVITY).optional(),
  region: z.string().optional().describe('Where data must stay (eu, us, eu-west-1...).'),
  retention: duration.optional(),
  description: z.string().optional(),
});

export const EvalSchema = z.strictObject({
  name: z.string(),
  value: z.union([z.number(), z.string()]).optional(),
  target: z.union([z.number(), z.string()]).optional(),
  higher_is_better: z.boolean().optional().describe('Defaults to true. Used to color value vs target.'),
  description: z.string().optional(),
  url: z.string().regex(/^https?:\/\//).optional(),
});

export const RolloutSchema = z.strictObject({
  strategy: z.enum(ROLLOUTS),
  percent: z.number().min(0).max(100).optional(),
  previous: z.string().optional().describe('Version being replaced (rollback target).'),
});

export const SandboxSchema = z.strictObject({
  network: z.enum(NETWORK).optional(),
  allow: z.array(z.string()).optional().describe('Allowed hosts when network is `allowlist`.'),
  filesystem: z.enum(['none', 'read-only', 'workspace', 'full']).optional(),
});

/** Operational facts shared by agents and nodes (nodes inherit them from their agent). */
const ops = {
  trigger: TriggerSchema.optional().describe('What starts this node (entry nodes, scheduled agents).'),
  approval: ApprovalSchema.optional().describe('Human-in-the-loop gate: who, how, deadline.'),
  budget: BudgetSchema.optional(),
  limits: LimitsSchema.optional(),
  fanout: FanoutSchema.optional().describe('Runs as N parallel copies.'),
  data: DataSchema.optional().describe('Sensitivity and residency of the data handled here.'),
  evals: z.array(EvalSchema).optional(),
  version: z.string().optional(),
  rollout: RolloutSchema.optional(),
  sla: duration.optional().describe('Deadline to complete (e.g. a regulatory 72h).'),
  credentials: z.enum(CREDENTIALS).optional().describe('Whose credentials the tools use: a service account, the author, or the end user.'),
  sandbox: SandboxSchema.optional(),
};

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
  match: z.array(z.string()).optional().describe('Live event rules, e.g. "agent:coder", "tool:mcp__github__*", "source:hermes&tool:shell".'),
  ...ops,
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
  match: z.array(z.string()).optional().describe('Live event rules; inherited from the agent. Default: match by id, label, agent and tool names.'),
  ...ops,
  meta: meta.optional(),
});

export const EdgeObjectSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  kind: z.enum(EDGE_KINDS).default('flow'),
  label: z.string().optional(),
  condition: z.string().optional(),
  protocol: z.enum(PROTOCOLS).optional(),
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
export type Protocol = (typeof PROTOCOLS)[number];
/** The operational fields an agent or node can carry. */
export type OpsDef = Pick<NodeDef, keyof typeof ops>;
export const OPS_KEYS = Object.keys(ops) as (keyof typeof ops)[];
