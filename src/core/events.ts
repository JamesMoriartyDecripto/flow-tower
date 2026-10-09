import { z } from 'zod';
import type { ResolvedNode, Workspace } from './types.ts';

/** What happened. Kept small on purpose: every source is normalized onto these. */
export const EVENT_KINDS = [
  'session.start', 'session.end', 'prompt', 'agent.start', 'agent.end',
  'tool.start', 'tool.end', 'error', 'log', 'usage',
] as const;

/** The normalized live event. Unknown fields from a source travel in `data`. */
export const FlowEventSchema = z.looseObject({
  kind: z.enum(EVENT_KINDS),
  source: z.string().default('custom').describe('claude-code, agent-sdk, pi, hermes, otel, custom...'),
  ts: z.number().optional().describe('Epoch milliseconds; filled in by the server when missing.'),
  session: z.string().optional(),
  agent: z.string().optional().describe('Agent or subagent name/type.'),
  parent: z.string().optional().describe('Parent agent/session id, for subagents.'),
  tool: z.string().optional(),
  call: z.string().optional().describe('Tool call id: pairs tool.start with tool.end.'),
  model: z.string().optional(),
  node: z.string().optional().describe('Explicit target: "layer.node" or a node id. Skips matching.'),
  tower: z.string().optional().describe('Restrict matching to towers whose id or name contains this.'),
  status: z.enum(['ok', 'error']).optional(),
  message: z.string().optional(),
  tokens: z.number().optional(),
  cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  data: z.unknown().optional(),
});

export type FlowEventInput = z.input<typeof FlowEventSchema>;
export type FlowEvent = z.output<typeof FlowEventSchema> & {
  id: number;
  ts: number;
  /** "towerId#layer.node" for every node the event maps onto. */
  targets: string[];
};

export const targetKey = (tower: string, node: string) => `${tower}#${node}`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9*]/g, '');

/** Glob-lite: `*` matches anything, comparison ignores case and punctuation. */
function like(value: string | undefined, pattern: string): boolean {
  if (value === undefined) return false;
  const re = new RegExp(`^${norm(pattern).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return re.test(norm(value));
}

/**
 * Does `event` concern `node`? Explicit `match:` rules win ("agent:coder", "tool:mcp__github__*",
 * "source:hermes&tool:shell"); otherwise the node's id, label, agent id/name and tool names are used.
 */
export function eventMatches(node: ResolvedNode, event: z.output<typeof FlowEventSchema>): boolean {
  if (event.node) return event.node === node.key || event.node === node.id;
  const rules = node.match ?? [];
  if (rules.length) {
    return rules.some((rule) => rule.split('&').every((part) => {
      const [field, pattern] = part.includes(':') ? part.split(/:(.*)/s) : ['agent', part];
      return like((event as Record<string, unknown>)[field.trim()] as string | undefined, pattern.trim());
    }));
  }
  const names = [node.id, node.label, node.agent?.id, node.agent?.name].filter(Boolean) as string[];
  // A tool call lights both the agent that made it and the tool node it used.
  const agentHit = event.agent !== undefined && node.type !== 'tool' && names.some((n) => like(event.agent, n));
  if (agentHit || !event.tool || node.type !== 'tool') return agentHit;
  // MCP tools arrive as mcp__<server>__<tool>: match the server too.
  const server = event.tool.startsWith('mcp__') ? event.tool.split('__')[1] : undefined;
  return names.some((n) => like(event.tool, n) || (server !== undefined && like(server, n)));
}

/** Every "tower#node" the event lands on, across all towers of the library. */
export function resolveTargets(ws: Workspace, event: z.output<typeof FlowEventSchema>): string[] {
  const out: string[] = [];
  for (const tower of Object.values(ws.towers)) {
    if (event.tower && !like(tower.id, `*${event.tower}*`) && !like(tower.name, `*${event.tower}*`)) continue;
    for (const layer of tower.layers) for (const node of layer.nodes) {
      if (eventMatches(node, event)) out.push(targetKey(tower.id, node.key));
    }
  }
  return out;
}
