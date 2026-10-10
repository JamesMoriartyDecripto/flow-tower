import { query, type AgentDefinition, type CanUseTool, type Options } from '@anthropic-ai/claude-agent-sdk';
import { ROLE_MODEL, loadMcpServers, sdkEnv, type Role, type RoleModel } from './config';
import { buildHooks } from './hooks';
import { runOpenRouterAgent } from './openrouter-agent';
import { squadServer } from './tools';

export interface AgentRun { text: string; costUsd: number; sessionId: string; ok: boolean }

/**
 * Pipeline runs are headless: nobody answers a permission prompt. settings.json `ask` rules
 * (and the bash guard's `ask`) are checked before allowedTools and fall through to this
 * callback, which allows only the tools listed here and denies the rest with a reason.
 */
export function headlessPermissions(allow: string[] = []): CanUseTool {
  return async (toolName, input) => allow.includes(toolName)
    ? { behavior: 'allow', updatedInput: input }
    : { behavior: 'deny', message: `No human is watching this run, so ${toolName} cannot be confirmed. Take a path that needs no approval.` };
}

/**
 * Runs ONE agent definition as the main thread of a brand-new session.
 * Used for the quick-fix coder, reviewer, security auditor, fixer, verifier and
 * doc-writer: no parent conversation leaks in, so each judgement is made with fresh context.
 * `role` tells the hooks which agent this is (a main thread has no agent_type) and picks
 * the provider from ROLE_MODEL; `route` overrides it (the escalated last fix round).
 */
export async function runAgent(
  agent: AgentDefinition,
  prompt: string,
  opts: { cwd: string; issue: number; role: string; areas?: string[]; maxTurns: number; maxBudgetUsd: number; route?: RoleModel } & Partial<Options>,
): Promise<AgentRun> {
  const { cwd, issue, role, areas, route = ROLE_MODEL[role as Role] ?? { provider: 'claude', model: agent.model }, ...rest } = opts;
  if (route.provider === 'openrouter') {
    // Same prompt and caps, own tool loop: SDK hooks do not run there, its fences are in code.
    return runOpenRouterAgent({ role, model: route.model, system: agent.prompt, prompt, cwd,
      canWrite: role === 'coder', maxSteps: rest.maxTurns, maxBudgetUsd: rest.maxBudgetUsd });
  }
  const run = query({
    prompt,
    options: {
      cwd,
      systemPrompt: agent.prompt,
      model: route.model,
      tools: agent.tools,
      allowedTools: agent.tools, // least privilege: exactly the tools in the agent file
      mcpServers: { ...loadMcpServers(), squad: squadServer(cwd) },
      hooks: buildHooks({ worktree: cwd, issue, role, areas }),
      canUseTool: headlessPermissions(),
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
