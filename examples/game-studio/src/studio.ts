import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { studioTeam } from './agents';
import { LIMITS, ROLE_MODEL, loadMcpServers, sdkEnv } from './config';
import { buildHooks } from './hooks';
import { recallPatterns } from './memory/store';
import { compact, renderPrompt } from './prompts';
import { forgeServer } from './tools';

export interface MilestoneReport {
  milestone: string;
  status: 'done' | 'blocked' | 'at_risk';
  delivered: string[];
  slipped: string[];
  risks: string[];
  next: string[];
  sessionId: string;
  costUsd: number;
}

/**
 * Orchestrator-workers. The Opus producer owns the milestone plan and dispatches
 * department specialists in parallel through the Agent tool. It cannot touch
 * Blender, Unreal or code itself: it plans, delegates, unblocks and reports.
 * Each subagent has its own context; only its final summary returns.
 */
export async function runProducer(opts: {
  runId: string;
  cwd: string;
  milestone: string;
  gdd: string;
  budgetUsd: number;
  resume?: string;
}): Promise<MilestoneReport> {
  const team = studioTeam();
  const run = query({
    prompt: renderPrompt('producer', {
      project: 'Emberwake',
      milestone: opts.milestone,
      budget_usd: opts.budgetUsd,
      departments: compact(Object.fromEntries(Object.entries(team).map(([id, a]) => [id, a.description]))),
    }) + `\n\n## Current GDD\n${opts.gdd.slice(0, 12_000)}\n\n## Learned rules\n${recallPatterns(['production', opts.milestone])}`,
    options: {
      cwd: opts.cwd,
      model: ROLE_MODEL.producer,
      fallbackModel: ROLE_MODEL['game-designer'],
      tools: ['Agent', 'Read', 'Grep', 'Glob', 'TodoWrite', 'mcp__forge__request_approval', 'mcp__github__create_issue'],
      allowedTools: ['Agent', 'Read', 'Grep', 'Glob', 'TodoWrite'],
      permissionMode: 'default',
      agents: team,
      mcpServers: { ...loadMcpServers(['blender', 'unreal', 'imagegen', 'github', 'figma', 'analytics']), forge: forgeServer },
      hooks: buildHooks({ department: 'producer', runId: opts.runId, cwd: opts.cwd }),
      settingSources: ['project'],
      resume: opts.resume,
      effort: 'high',
      ...LIMITS.producer,
      maxBudgetUsd: Math.min(LIMITS.producer.maxBudgetUsd, opts.budgetUsd),
      env: sdkEnv({ FORGE_RUN: opts.runId, FORGE_MILESTONE: opts.milestone }),
    },
  });

  let result: SDKResultMessage | undefined;
  const inFlight = new Map<string, string>();
  for await (const msg of run) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' && block.name === 'Agent') {
          const input = block.input as { subagent_type?: string; description?: string };
          inFlight.set(block.id, input.subagent_type ?? 'general');
          console.log(`[producer] -> ${input.subagent_type}: ${input.description ?? ''} (${inFlight.size} in flight)`);
        }
      }
    }
    if (msg.type === 'user') {
      for (const block of Array.isArray(msg.message.content) ? msg.message.content : []) {
        if (block.type === 'tool_result') inFlight.delete(block.tool_use_id);
      }
    }
    if (msg.type === 'result') result = msg;
  }

  if (!result) throw new Error('producer produced no result');
  if (result.subtype !== 'success') {
    return { milestone: opts.milestone, status: 'blocked', delivered: [], slipped: [], risks: [result.subtype], next: [], sessionId: result.session_id, costUsd: result.total_cost_usd };
  }
  const json = result.result.match(/\{[\s\S]*\}\s*$/)?.[0];
  if (!json) throw new Error('producer did not end with the milestone JSON report');
  return { ...JSON.parse(json), sessionId: result.session_id, costUsd: result.total_cost_usd };
}
