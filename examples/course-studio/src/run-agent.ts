import { query, type AgentDefinition, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { loadMcpServers, sdkEnv, type Run } from './config';
import { buildHooks } from './hooks';
import { studioServer } from './tools';

export interface AgentRun { text: string; costUsd: number; sessionId: string; ok: boolean }

/**
 * Runs one specialist as its own top-level query() in a FRESH session. Used where code,
 * not the director, decides the fan-out: module writers, reviewers, simulated learners.
 * Fresh sessions matter for evaluators: they cannot anchor on what they said last round.
 */
export async function runAgent(
  def: AgentDefinition,
  prompt: string,
  opts: { run: Run; maxTurns: number; maxBudgetUsd: number; model?: string; label?: string },
): Promise<AgentRun> {
  const stream = query({
    prompt,
    options: {
      cwd: opts.run.dir,
      systemPrompt: def.prompt,
      model: opts.model ?? def.model,
      tools: def.tools,
      allowedTools: def.tools, // pre-approved; anything else falls through to settings.json rules
      permissionMode: 'default',
      mcpServers: { ...loadMcpServers(), studio: studioServer },
      hooks: buildHooks(opts.run),
      settingSources: ['project'],
      maxTurns: opts.maxTurns,
      maxBudgetUsd: opts.maxBudgetUsd,
      env: sdkEnv({ FORGE_RUN: opts.run.slug, FORGE_AGENT: opts.label ?? 'specialist' }),
    },
  });

  let result: SDKResultMessage | undefined;
  for await (const msg of stream) if (msg.type === 'result') result = msg;
  if (!result) throw new Error(`${opts.label ?? 'agent'} produced no result`);
  const ok = result.subtype === 'success';
  return { text: ok ? result.result : `stopped: ${result.subtype}`, costUsd: result.total_cost_usd, sessionId: result.session_id, ok };
}

/** Agents end with a JSON block; take the last one and fail loudly if it is missing. */
export function lastJson<T>(text: string): T {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
  const raw = fenced ?? text.match(/[[{][\s\S]*[\]}]\s*$/)?.[0];
  if (!raw) throw new Error(`expected a JSON verdict, got: ${text.slice(0, 200)}`);
  return JSON.parse(raw) as T;
}
