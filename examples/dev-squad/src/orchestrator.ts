import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { leadTeam } from './agents';
import { LIMITS, MODELS, PLAN_GATE, ROLE_MODEL, loadMcpServers, sdkEnv } from './config';
import { buildHooks } from './hooks';
import { recallPatterns } from './memory/store';
import { renderPrompt, untrusted } from './prompts';
import { headlessPermissions } from './run-agent';
import { squadServer } from './tools';
import { takeCoderSpend } from './tools/run-coder';
import type { Issue } from './main';
import type { Triage } from './triage';

export interface Worktree { path: string; branch: string }

const LEAD_TOOLS = ['Agent', 'Read', 'Grep', 'Glob', 'TodoWrite', 'mcp__squad__run_coder', 'mcp__squad__request_approval', 'mcp__squad__file_followup'];

export interface LeadReport {
  status: 'ready_for_review' | 'blocked' | 'awaiting_approval';
  plan: string;
  steps_done: string[];
  steps_skipped: string[];
  tests: 'green' | 'red';
  pr_title: string;
  notes: string;
  sessionId: string;
  costUsd: number;
}

/**
 * Orchestrator-workers: an Opus lead plans with the architect, fans research out
 * in parallel, then walks the plan step by step with coders (DeepSeek via run_coder). Each subagent
 * has its own context window; only its final report comes back to the lead.
 * A risky plan ends the session with status `awaiting_approval`; the pipeline then resumes
 * the same session (`resume`) with the human's answer as the next prompt.
 */
export async function runLead(issue: Issue, triage: Triage, wt: Worktree, resume?: { sessionId: string; answer: string }): Promise<LeadReport> {
  const vars = {
    repo: issue.repo,
    issue_number: String(issue.number),
    issue_title: issue.title,
    issue_body: untrusted(issue.body),
    worktree: wt.path,
    branch: wt.branch,
  };

  const run = query({
    prompt: resume ? resume.answer : renderPrompt('orchestrator', {
      ...vars,
      kind: triage.kind,
      complexity: triage.complexity,
      risk: triage.risk,
      areas: triage.areas.join(', '),
      max_steps: PLAN_GATE.maxSteps,
    }),
    options: {
      ...(resume && { resume: resume.sessionId }),
      cwd: wt.path,
      model: ROLE_MODEL.lead.model,
      fallbackModel: MODELS.sonnet,
      // The lead coordinates; it cannot edit files or run shell commands itself.
      tools: LEAD_TOOLS,
      allowedTools: LEAD_TOOLS,
      // settings.json asks before request_approval (for interactive sessions); here the lead may always ask.
      canUseTool: headlessPermissions(['mcp__squad__request_approval']),
      permissionMode: 'default',
      agents: leadTeam({ ...vars, triage: JSON.stringify(triage), patterns: recallPatterns(triage.areas) }),
      mcpServers: { ...loadMcpServers(), squad: squadServer(wt.path) },
      hooks: buildHooks({ worktree: wt.path, issue: issue.number, areas: triage.areas, role: 'lead' }),
      settingSources: ['project'], // loads CLAUDE.md + .claude/settings.json permissions
      maxTurns: LIMITS.lead.maxTurns,
      maxBudgetUsd: LIMITS.lead.maxBudgetUsd,
      effort: 'high',
      env: sdkEnv({ SQUAD_ISSUE: String(issue.number) }),
    },
  });

  let result: SDKResultMessage | undefined;
  for await (const msg of run) {
    if (msg.type === 'assistant') logDelegations(msg.message.content);
    if (msg.type === 'result') result = msg;
  }
  if (!result) throw new Error('lead produced no result');
  if (result.subtype !== 'success') {
    return blocked(result.session_id, result.total_cost_usd + takeCoderSpend(wt.path), `lead stopped: ${result.subtype}`);
  }
  const report = parseReport(result.result);
  // OpenRouter coder runs are not in the SDK's total: add them, or the issue budget would miss them.
  const costUsd = result.total_cost_usd + takeCoderSpend(wt.path);
  console.log(`[lead] report status=${report.status} tests=${report.tests} cost_usd=${costUsd.toFixed(2)} turns=${result.num_turns}/${LIMITS.lead.maxTurns}`);
  return { ...report, sessionId: result.session_id, costUsd };
}

function logDelegations(content: Array<{ type: string; name?: string; input?: unknown }>) {
  for (const block of content) {
    // "Agent" in current SDKs, "Task" in older ones.
    if (block.type === 'tool_use' && (block.name === 'Agent' || block.name === 'Task')) {
      const input = block.input as { subagent_type?: string; description?: string };
      console.log(`[lead] -> ${input.subagent_type ?? 'general'}: ${input.description ?? ''}`);
    }
  }
}

function parseReport(text: string): Omit<LeadReport, 'sessionId' | 'costUsd'> {
  const json = text.match(/\{[\s\S]*\}\s*$/)?.[0];
  if (!json) throw new Error('lead did not return the final JSON report');
  return JSON.parse(json);
}

const blocked = (sessionId: string, costUsd: number, notes: string): LeadReport => ({
  status: 'blocked', plan: '', steps_done: [], steps_skipped: [], tests: 'red', pr_title: '', notes, sessionId, costUsd,
});
