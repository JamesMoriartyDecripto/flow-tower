import { query, type AgentDefinition, type Options } from '@anthropic-ai/claude-agent-sdk';
import { loadMcpServers, sdkEnv } from './config';
import { buildHooks } from './hooks';
import { squadServer } from './tools';

export interface AgentRun { text: string; costUsd: number; sessionId: string; ok: boolean }

/**
 * Runs ONE agent definition as the main thread of a brand-new session.
 * Used for the reviewer, security auditor, fixer and verifier: no parent
 * conversation leaks in, so each judgement is made with fresh context.
 */
export async function runAgent(
  agent: AgentDefinition,
  prompt: string,
  opts: { cwd: string; issue: number; maxTurns: number; maxBudgetUsd: number; resume?: string } & Partial<Options>,
): Promise<AgentRun> {
  const { cwd, issue, ...rest } = opts;
  const run = query({
    prompt,
    options: {
      cwd,
      systemPrompt: agent.prompt,
      model: agent.model,
      tools: agent.tools,
      allowedTools: agent.tools, // least privilege: exactly the tools in the agent file
      mcpServers: { ...loadMcpServers(), squad: squadServer },
      hooks: buildHooks({ worktree: cwd, issue }),
      settingSources: ['project'],
      env: sdkEnv({ SQUAD_ISSUE: String(issue) }),
      ...rest,
    },
  });

  for await (const msg of run) {
    if (msg.type !== 'result') continue;
    const text = msg.subtype === 'success' ? msg.result : msg.errors.join('\n');
    return { text, costUsd: msg.total_cost_usd, sessionId: msg.session_id, ok: msg.subtype === 'success' };
  }
  throw new Error('agent produced no result');
}

/** Pulls the last JSON object out of a model reply (agents are told to answer JSON only). */
export function lastJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/g)?.at(-1);
  if (!match) throw new Error(`expected JSON, got: ${text.slice(0, 200)}`);
  return JSON.parse(match) as T;
}
