import { query, type AgentDefinition, type Options } from '@anthropic-ai/claude-agent-sdk';
import { loadMcpServers, sdkEnv } from './config';
import { buildHooks } from './hooks';
import { forgeServer } from './tools';

export interface AgentRun { text: string; costUsd: number; sessionId: string; ok: boolean }

export interface RunOpts extends Partial<Options> {
  cwd: string;
  department: string;
  runId: string;
  maxTurns: number;
  maxBudgetUsd: number;
  /** Only these external MCP servers are attached (least privilege per department). */
  servers?: string[];
}

/**
 * Runs ONE agent definition as the main thread of a brand-new session.
 * Used for evaluators, fixers, bots and department specialists: no parent
 * conversation leaks in, so every judgement is made with fresh context.
 */
export async function runAgent(agent: AgentDefinition, prompt: string, opts: RunOpts): Promise<AgentRun> {
  const { cwd, department, runId, servers, ...rest } = opts;
  const run = query({
    prompt,
    options: {
      cwd,
      systemPrompt: agent.prompt,
      model: agent.model,
      tools: agent.tools,
      allowedTools: agent.tools, // exactly the tools in the agent file, nothing inherited
      mcpServers: { ...loadMcpServers(servers), forge: forgeServer },
      hooks: buildHooks({ department, runId, cwd }),
      settingSources: ['project'],
      env: sdkEnv({ FORGE_RUN: runId, FORGE_DEPARTMENT: department }),
      ...rest,
    },
  });

  for await (const msg of run) {
    if (msg.type !== 'result') continue;
    const text = msg.subtype === 'success' ? msg.result : msg.errors.join('\n');
    return { text, costUsd: msg.total_cost_usd, sessionId: msg.session_id, ok: msg.subtype === 'success' };
  }
  throw new Error(`${department}: agent produced no result`);
}

/** Pulls the last JSON object out of a model reply (agents are told to end with JSON). */
export function lastJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/g)?.at(-1);
  if (!match) throw new Error(`expected JSON, got: ${text.slice(0, 200)}`);
  return JSON.parse(match) as T;
}

/** Sums costs of parallel runs; keeps department ledgers honest. */
export const totalCost = (runs: { costUsd: number }[]) => runs.reduce((sum, r) => sum + r.costUsd, 0);
