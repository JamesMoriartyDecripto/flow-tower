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
export const PROTOCOLS = ['mcp', 'a2a', 'http', 'grpc', 'webhook', 'queue', 'event', 'stdio', 'email', 'manual'] as const;

export const TRIGGER_KINDS = ['manual', 'cron', 'webhook', 'event', 'queue', 'chat', 'email', 'file'] as const;
export const SENSITIVITY = ['public', 'internal', 'confidential', 'pii', 'phi', 'pci', 'biometric', 'secret'] as const;
export const ROLLOUTS = ['all', 'canary', 'staged', 'ab', 'shadow', 'blue-green', 'rainbow'] as const;
/** GDPR art. 6(1) lawful bases for processing personal data. */
export const LAWFUL_BASES = ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests'] as const;
export const APPROVAL_ACTIONS = ['approve', 'edit', 'reject', 'respond', 'snooze', 'dismiss', 'takeover'] as const;
/** Over what a budget or a quota is counted. */
export const PER = ['call', 'run', 'session', 'item', 'copy', 'day', 'week', 'month', 'year'] as const;
export const CREDENTIALS = ['service', 'author', 'user'] as const;
export const NETWORK = ['none', 'allowlist', 'open'] as const;

const id = z.string().regex(/^[A-Za-z0-9_-]+$/, 'ids may only contain letters, digits, "_" and "-"');
const meta = z.record(z.string(), z.unknown()).describe('Free-form key/value metadata shown in the inspector.');
/** "250ms", "90s", "5m", "72h", "7d", "2w", "10y". */
const duration = z.string().regex(/^\d+(\.\d+)?(ms|s|m|h|d|w|y)$/, 'durations look like 250ms, 90s, 5m, 72h, 7d, 2w, 10y');
/** "100/24h", "300/5m", "15000/d": a count per time window. */
const rate = z.string().regex(/^\d+(\.\d+)?\s*\/\s*(\d+(\.\d+)?)?(ms|s|m|h|d|w|y)$/, 'rates look like 100/24h, 300/5m, 15000/d');
const oneOrMany = <T extends z.ZodType>(t: T) => z.union([t, z.array(t).min(1)]);

export const TriggerSchema = z.strictObject({
  kind: z.enum(TRIGGER_KINDS),
  schedule: z.string().optional().describe('Cron expression for `cron` (e.g. "0 9 * * 1-5").'),
  source: z.string().optional().describe('Who fires it: PagerDuty, Gmail, a queue name, a Slack channel...'),
  timezone: z.string().optional().describe('IANA zone the schedule and hours are in, e.g. "Europe/Rome".'),
  hours: z.string().optional().describe('When it may fire, e.g. "Mon-Fri 09:00-18:00" or "business days".'),
  description: z.string().optional(),
});

export const ApprovalSchema = z.strictObject({
  by: z.string().optional().describe('Role or person who approves.'),
  actions: z.array(z.enum(APPROVAL_ACTIONS)).optional().describe('`takeover`: a human takes the session over (live view) while automation pauses.'),
  timeout: duration.optional(),
  on_timeout: z.enum(['approve', 'reject', 'escalate', 'wait']).optional(),
  escalate_to: z.string().optional().describe('Backup approver when it times out or is escalated.'),
  via: oneOrMany(z.string()).optional().describe('Slack, email, PR review, app... several channels as a list.'),
  relayed_by: z.string().optional().describe('Agent that carries the request to the human and the answer back.'),
  when: z.string().optional().describe('Condition that requires it, e.g. "refund > 500 EUR" or "discount > 10%". Without it: always.'),
  per: z.string().optional().describe('Asked per item instead of once, e.g. "flag", "row", "invoice".'),
  rounds: z.number().int().positive().optional().describe('Revision rounds included before it must be approved or rejected.'),
  description: z.string().optional(),
});

const BudgetItemSchema = z.strictObject({
  usd: z.number().positive().optional().describe('Amount in US dollars (shorthand for amount + currency USD).'),
  amount: z.number().positive().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code, e.g. EUR').optional(),
  tokens: z.number().int().positive().optional(),
  turns: z.number().int().positive().optional(),
  per: z.enum(PER).optional().describe('What the budget is counted over. Default: one run of this node.'),
  for: z.string().optional().describe('What it pays for when several budgets apply: model, media, ads, api...'),
  rate: z.string().optional().describe('Unit price, e.g. "0.40 USD/s of video" or "1.20 EUR/take".'),
  on_exceed: z.enum(['pause', 'stop', 'escalate', 'downgrade']).optional(),
  description: z.string().optional(),
});
/** One budget, or several (e.g. model spend and media spend counted separately). */
export const BudgetSchema = oneOrMany(BudgetItemSchema);

export const LimitsSchema = z.strictObject({
  timeout: duration.optional(),
  ttl: duration.optional().describe('Lifetime of a session / sandbox / browser.'),
  retries: z.number().int().min(0).optional(),
  backoff: z.string().optional().describe('e.g. "exponential 2s..60s".'),
  max_iterations: z.number().int().positive().optional().describe('Bound for loops (review rounds, tournament rounds...).'),
  concurrency: z.number().int().positive().optional(),
  rate: oneOrMany(rate).optional().describe('Quotas and rate limits, e.g. "100/24h" posts or ["300/5m", "15000/d"] requests.'),
  description: z.string().optional(),
});

/** Parallel copies of this node: a number, or a range when it scales with the task. */
export const FanoutSchema = z.union([
  z.number().int().min(2),
  z.strictObject({
    min: z.number().int().min(1).optional(),
    max: z.number().int().min(2),
    by: oneOrMany(z.string()).optional().describe('What decides the count; several dimensions multiply (store × locale × device).'),
    from: z.array(z.string()).optional().describe('Different agents the copies are picked from (a supervisor queue), by agent id.'),
    pick: z.string().optional().describe('How they are picked, e.g. "weighted by queue priority".'),
  }),
]);

export const DataSchema = z.strictObject({
  sensitivity: z.enum(SENSITIVITY).optional(),
  region: z.string().optional().describe('Where data must stay (eu, us, eu-west-1...).'),
  retention: z.union([duration, z.literal('none')]).optional().describe('How long it is kept; `none` = in memory only, never persisted.'),
  retention_after: z.string().optional().describe('Event the retention runs from, e.g. "matter close" (default: creation).'),
  lawful_basis: z.enum(LAWFUL_BASES).optional().describe('GDPR basis for processing personal data.'),
  disclosure: z.array(z.string()).optional().describe('Labels and provenance on what it publishes: "C2PA", "AI-generated label", "EU AI Act art. 50"...'),
  description: z.string().optional(),
});

export const EvalSchema = z.strictObject({
  name: z.string(),
  value: z.union([z.number(), z.string()]).optional(),
  target: z.union([z.number(), z.string()]).optional(),
  higher_is_better: z.boolean().optional().describe('Defaults to true. Used to color value vs target.'),
  unit: z.string().optional().describe('"%", "ms", "Elo", "USD"... Relative scores (Elo, rank) need no target.'),
  illustrative: z.boolean().optional().describe('True when the number is an example, not a measurement.'),
  description: z.string().optional(),
  url: z.string().regex(/^https?:\/\//).optional(),
});

export const RolloutSchema = z.strictObject({
  strategy: z.enum(ROLLOUTS),
  percent: z.number().min(0).max(100).optional().describe('Current share of traffic.'),
  steps: z.array(z.number().min(0).max(100)).optional().describe('Staged / phased schedule, e.g. [1, 5, 25, 100].'),
  metric: z.string().optional().describe('What decides promotion, e.g. "approval rate" or "crash-free sessions".'),
  guard: z.string().optional().describe('Halt or roll back when, e.g. "crash-free < 99.5%".'),
  arms: z.array(z.string()).optional().describe('A/B arms, e.g. ["prompt v3", "prompt v4"].'),
  sample: z.union([z.number(), z.string()]).optional().describe('Sample size per step or arm.'),
  previous: z.string().optional().describe('Version being replaced (rollback target).'),
});

/** A deadline: a duration, or relative to an event / absolute / on business days, with external waits apart. */
export const SlaSchema = z.union([duration, z.strictObject({
  within: duration.optional(),
  after: z.string().optional().describe('Event it runs from, e.g. "SDI rejection" or "store submission".'),
  before: z.string().optional().describe('Event it must end before, e.g. "release".'),
  by: z.string().optional().describe('Absolute date or time, e.g. "2026-12-31".'),
  business: z.boolean().optional().describe('Counted in business days / hours (see trigger hours and timezone).'),
  external: z.boolean().optional().describe('An external wait (store review, carrier, regulator), not our processing time.'),
  description: z.string().optional(),
})]);

/** Long-running external jobs (renders, reviews, exports): how the result comes back. */
export const AsyncSchema = z.strictObject({
  mode: z.enum(['poll', 'callback', 'both']),
  interval: duration.optional().describe('Polling interval.'),
  timeout: duration.optional(),
  description: z.string().optional(),
});

/** A decision node's typed output (decision models): what it returns and how it is thresholded. */
export const DecisionSchema = z.strictObject({
  output: z.enum(['binary', 'choice', 'score', 'ranking']),
  candidates: z.array(z.string()).optional().describe('Allowed answers for `choice` (and labels for `binary`).'),
  threshold: z.union([z.number(), z.string()]).optional().describe('e.g. 0.8 (probability) or ">= 70".'),
  confidence: z.boolean().optional().describe('Returns a probability / confidence with the answer.'),
  model: z.string().optional().describe('Pinned decision model or policy version.'),
  fail: z.enum(['open', 'closed']).optional().describe('On error or low confidence: let it through (open) or block (closed).'),
  description: z.string().optional(),
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
  sla: SlaSchema.optional().describe('Deadline to complete: "72h", or { within, after, before, by, business, external }.'),
  async: AsyncSchema.optional().describe('Result comes back later: poll or callback.'),
  exactly_once: z.boolean().optional().describe('Must run at most once per item (payouts, filings): idempotency key, no retries that repeat it.'),
  decision: DecisionSchema.optional().describe('Typed output of a decision (decision models).'),
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
  skills: z.array(z.string()).optional().describe('Agent Skills it can load.'),
  disabled_tools: z.array(z.string()).optional().describe('Built-in tools turned off for this agent.'),
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
  async: z.boolean().optional().describe('Fire-and-forget: the source does not wait (spawns, events). Default: it waits.'),
  group: z.string().optional().describe('Edges from the same node with the same group are alternatives: exactly one is taken.'),
  version: z.string().optional().describe('Protocol version, e.g. A2A "0.3" or an API version.'),
  card: z.string().regex(/^https?:\/\//).optional().describe('A2A agent card URL of the target.'),
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
  budget: BudgetSchema.optional().describe('Whole run / session of the system, across every node.'),
  limits: LimitsSchema.optional().describe('Whole run / session of the system, across every node.'),
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
export type BudgetItem = z.infer<typeof BudgetItemSchema>;
export type LimitsDef = z.infer<typeof LimitsSchema>;
/** The operational fields an agent or node can carry. */
export type OpsDef = Pick<NodeDef, keyof typeof ops>;
export const OPS_KEYS = Object.keys(ops) as (keyof typeof ops)[];
