import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { PATHS, ROLE_MODEL, type Role } from './config';
import { renderPrompt } from './prompts';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Turns .claude/agents/*.md into programmatic AgentDefinitions.
 * The same files work in interactive Claude Code; here we pin model and tools
 * explicitly so a stray edit cannot silently widen an agent's permissions.
 */
export function loadAgentFiles(): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};
  for (const file of readdirSync(PATHS.agents).filter((f) => f.endsWith('.md'))) {
    const match = FRONTMATTER.exec(readFileSync(join(PATHS.agents, file), 'utf8'));
    if (!match) throw new Error(`${file}: missing YAML frontmatter`);
    const meta = parse(match[1]) as { name: string; description: string; tools: string; model?: string };
    agents[meta.name] = {
      description: meta.description,
      prompt: match[2].trim(),
      tools: meta.tools.split(',').map((t) => t.trim()),
      model: ROLE_MODEL[meta.name as Role]?.model ?? meta.model,
    };
  }
  return agents;
}

/** The architect has no agent file: its prompt is a template filled per issue. */
export function architectAgent(vars: Record<string, string>): AgentDefinition {
  return {
    description: 'Planner. Use FIRST on every full-route issue to produce the step plan (YAML). Read-only.',
    prompt: renderPrompt('architect', vars),
    tools: ['Read', 'Grep', 'Glob'],
    model: ROLE_MODEL.architect.model,
    maxTurns: 30,
  };
}

/**
 * Agents the lead may delegate to. Reviewers are deliberately absent: they run later, fresh.
 * SDK subagents are Claude only, so an OpenRouter coder is reached through mcp__squad__run_coder.
 */
export function leadTeam(architectVars: Record<string, string>) {
  const { researcher, coder, tester, 'doc-writer': docWriter } = loadAgentFiles();
  return {
    architect: architectAgent(architectVars),
    researcher,
    ...(ROLE_MODEL.coder.provider === 'claude' && { coder: { ...coder, permissionMode: 'acceptEdits' as const } }),
    tester,
    'doc-writer': docWriter,
  } satisfies Record<string, AgentDefinition>;
}
