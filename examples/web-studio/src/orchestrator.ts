import { readFileSync } from 'node:fs';
import { query, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { deployGuard } from './hooks/deploy-guard';
import { studioServer } from './tools';

const prompt = (name: string) => readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), 'utf8');

/** Specialists the studio lead can dispatch. Leads of the two build lanes run in Claude Code instead. */
const agents: Record<string, AgentDefinition> = {
  researcher: { description: 'Audits one competitor site with Playwright. Use once per competitor.', prompt: prompt('researcher'), tools: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_snapshot', 'WebSearch'], model: 'sonnet' },
  'ia-architect': { description: 'Sitemap, content model and user flows.', prompt: prompt('ia-architect'), tools: ['Read', 'Write', 'mcp__figma__generate_diagram'], model: 'opus' },
  designer: { description: 'Designs one page template in Figma from the approved wireframe.', prompt: prompt('designer'), tools: ['mcp__figma__get_metadata', 'mcp__figma__get_screenshot', 'mcp__figma__get_variable_defs', 'mcp__figma__search_design_system', 'mcp__figma__use_figma'], model: 'sonnet' },
  copywriter: { description: 'Writes the copy of one page into its Payload draft.', prompt: prompt('copywriter'), tools: ['Read', 'mcp__studio__save_copy'], model: 'sonnet' },
  'qa-auditor': { description: 'Manual-style audit of a preview URL after the automated suites.', prompt: prompt('qa-auditor'), tools: ['Read', 'mcp__playwright__browser_navigate', 'mcp__playwright__browser_snapshot', 'mcp__playwright__browser_press_key', 'mcp__playwright__browser_evaluate'], model: 'sonnet' },
};

export async function runPhase(project: string, phase: string, brief: string) {
  const run = query({
    prompt: `Project ${project}. Run phase "${phase}". Brief:\n${brief}`,
    options: {
      model: 'claude-opus-5-5',
      systemPrompt: prompt('studio-lead'),
      agents,
      allowedTools: ['Agent', 'Read', 'TodoWrite', 'mcp__studio__request_signoff', 'mcp__linear__save_issue'],
      mcpServers: { studio: studioServer },
      settingSources: ['project'], // .mcp.json + CLAUDE.md of the client repo
      hooks: { PreToolUse: [{ matcher: 'Bash|mcp__vercel__.*', hooks: [deployGuard] }] },
      maxTurns: 80,
      maxBudgetUsd: 30,
    },
  });
  for await (const msg of run) {
    if (msg.type === 'result') return msg;
  }
}
