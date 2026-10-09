import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { directorTeam } from './agents';
import { LIMITS, ROLE_MODEL, loadMcpServers, sdkEnv, type Run } from './config';
import { buildHooks } from './hooks';
import type { Intake } from './intake';
import type { Brief } from './main';
import { recallPatterns } from './memory/session-log';
import { renderPrompt } from './prompts';
import { studioServer } from './tools';

export type Stage = 'research_design' | 'media_assessment' | 'pilot_fixes' | 'launch';

export interface DirectorReport {
  status: 'awaiting_signoff' | 'stage_done' | 'ready_to_publish' | 'blocked';
  stage: Stage;
  notes: string;
  sessionId: string;
  costUsd: number;
}

/**
 * Orchestrator-workers. The Opus director plans and delegates through the Agent tool; each
 * specialist has its own context window and only its final report comes back. The director
 * is ONE session resumed across stages, so it remembers the plan without re-reading it.
 */
export async function runDirector(
  brief: Brief, intake: Intake, run: Run, stage: Stage, input: string, resume?: string,
): Promise<DirectorReport> {
  const vars = { course_title: intake.title, audience: intake.audience, modules: String(intake.modules) };
  const prompt = resume
    ? `Stage: ${stage}.\n${input}`
    : renderPrompt('program-director', {
        ...vars,
        locales: intake.locales.join(', '),
        budget_usd: brief.budget_usd,
        intake: JSON.stringify(intake, null, 2),
        patterns: recallPatterns(intake.risk_flags),
      }) + `\n\nStage: ${stage}.\n${input}`;

  const stream = query({
    prompt,
    options: {
      cwd: run.dir,
      resume,
      model: ROLE_MODEL.director,
      fallbackModel: ROLE_MODEL['module-writer'],
      // The director coordinates. It cannot write course files or publish anything.
      tools: ['Agent', 'Read', 'Glob', 'TodoWrite', 'mcp__studio__request_signoff', 'mcp__notion__notion-update-page'],
      allowedTools: ['Agent', 'Read', 'Glob', 'TodoWrite', 'mcp__studio__request_signoff', 'mcp__notion__notion-update-page'],
      agents: directorTeam({ ...vars, locale: intake.locales[1] ?? 'es-ES' }),
      mcpServers: { ...loadMcpServers(), studio: studioServer },
      hooks: buildHooks(run),
      settingSources: ['project'], // CLAUDE.md + .claude/settings.json permissions
      maxTurns: LIMITS.director.maxTurns,
      maxBudgetUsd: LIMITS.director.maxBudgetUsd,
      effort: 'high',
      env: sdkEnv({ FORGE_RUN: run.slug, FORGE_AGENT: 'director' }),
    },
  });

  let result: SDKResultMessage | undefined;
  for await (const msg of stream) {
    if (msg.type === 'assistant') logDelegations(msg.message.content);
    if (msg.type === 'result') result = msg;
  }
  if (!result) throw new Error('director produced no result');
  if (result.subtype !== 'success') {
    return { status: 'blocked', stage, notes: `director stopped: ${result.subtype}`, sessionId: result.session_id, costUsd: result.total_cost_usd };
  }
  const json = JSON.parse(result.result.match(/\{[\s\S]*\}\s*$/)?.[0] ?? '{}');
  return { status: json.status ?? 'blocked', stage, notes: json.notes ?? result.result.slice(-400), sessionId: result.session_id, costUsd: result.total_cost_usd };
}

function logDelegations(content: Array<{ type: string; name?: string; input?: unknown }>) {
  for (const block of content) {
    if (block.type === 'tool_use' && (block.name === 'Agent' || block.name === 'Task')) {
      const input = block.input as { subagent_type?: string; description?: string };
      console.log(`[director] -> ${input.subagent_type ?? 'general'}: ${input.description ?? ''}`);
    }
  }
}
