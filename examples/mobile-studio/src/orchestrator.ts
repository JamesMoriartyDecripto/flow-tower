import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { createSdkMcpServer, query, tool, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { releaseGuard } from './hooks/release-guard';

const prompt = (name: string) => readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), 'utf8');

/** Specialists the studio lead dispatches. The app, iOS and Android leads run in Claude Code on the Mac instead. */
const agents: Record<string, AgentDefinition> = {
  'market-researcher': { description: 'Teardown of one competitor app from store data. Use once per competitor.', prompt: prompt('market-researcher'), tools: ['mcp__appfigures__*', 'WebSearch', 'WebFetch'], model: 'sonnet' },
  'review-miner': { description: 'Clusters low-star reviews of one competitor in one store.', prompt: prompt('review-miner'), tools: ['mcp__appfigures__*'], model: 'haiku' },
  'aso-strategist': { description: 'Keyword map for one locale.', prompt: prompt('aso-strategist'), tools: ['mcp__appfigures__*', 'Read', 'Write'], model: 'sonnet' },
  'product-lead': { description: 'Spec, user flows and acceptance criteria from the approved brief.', prompt: prompt('product-lead'), tools: ['Read', 'Write', 'mcp__figma__generate_diagram'], model: 'opus' },
  designer: { description: 'Figma design for one platform variant.', prompt: prompt('designer'), tools: ['mcp__figma__get_design_context', 'mcp__figma__get_variable_defs', 'mcp__figma__get_screenshot', 'mcp__figma__search_design_system', 'mcp__figma__use_figma'], model: 'sonnet' },
  architect: { description: 'Writes an ADR with scored options.', prompt: prompt('architect'), tools: ['Read', 'Write', 'WebFetch', 'mcp__expo__search_documentation'], model: 'opus' },
  'code-reviewer': { description: 'Reviews one PR with the mobile checklist.', prompt: prompt('code-reviewer'), tools: ['Read', 'Grep', 'mcp__github__pull_request_review_write'], model: 'sonnet' },
  'release-manager': { description: 'Builds, betas and submits a release candidate.', prompt: prompt('release-manager'), tools: ['mcp__expo__build_run', 'mcp__expo__build_info', 'mcp__expo__build_submit', 'mcp__expo__testflight_feedback', 'mcp__expo__testflight_crashes', 'Bash', 'mcp__studio__request_approval'], model: 'sonnet' },
  'store-copywriter': { description: 'Store listing for one locale.', prompt: prompt('store-copywriter'), tools: ['Read', 'Write'], model: 'sonnet' },
  'rejection-responder': { description: 'Maps a store rejection to a guideline and proposes the fix.', prompt: prompt('rejection-responder'), tools: ['Read', 'WebFetch', 'mcp__studio__request_approval'], model: 'opus' },
};

/** Human gates go through Slack; the returned approval id is what the release guard checks. */
const studio = createSdkMcpServer({
  name: 'studio',
  version: '1.0.0',
  tools: [
    tool(
      'request_approval',
      'Ask a named person to approve an action that reaches users. Returns an approval id or a rejection.',
      { approver: z.enum(['product owner', 'privacy lead', 'tech lead', 'support lead', 'on-call']), action: z.string(), evidence: z.array(z.string()), timeout: z.string() },
      async (args) => {
        const res = await fetch(`${env.APPROVALS_URL}/requests`, { method: 'POST', body: JSON.stringify(args) });
        return { content: [{ type: 'text', text: await res.text() }] };
      },
    ),
  ],
});

export async function runPhase(phase: string, input: string) {
  const run = query({
    prompt: `Leafwise. Run phase "${phase}".\n${input}`,
    options: {
      model: 'claude-opus-5-5',
      fallbackModel: 'claude-sonnet-5-5',
      systemPrompt: prompt('studio-lead'),
      agents,
      allowedTools: ['Agent', 'Read', 'TodoWrite', 'mcp__studio__request_approval', 'mcp__github__issue_write'],
      mcpServers: { studio },
      settingSources: ['project'], // .mcp.json + CLAUDE.md
      hooks: { PreToolUse: [{ matcher: 'Bash|Read|mcp__expo__.*|mcp__appfigures__.*', hooks: [releaseGuard] }] },
      maxTurns: 80,
      maxBudgetUsd: 40,
    },
  });
  for await (const msg of run) {
    if (msg.type === 'result') return msg;
  }
}
