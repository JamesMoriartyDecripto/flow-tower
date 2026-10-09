import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { PATHS, ROLE_MODEL, type Role } from './config';
import { fill } from './prompts';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Turns .claude/agents/*.md into programmatic AgentDefinitions. The same files work in
 * interactive Claude Code on the lead ID's laptop; here model and tools are pinned so a
 * stray edit cannot silently widen an agent's permissions.
 */
export function loadAgentFiles(vars: Record<string, string> = {}): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};
  for (const file of readdirSync(PATHS.agents).filter((f) => f.endsWith('.md'))) {
    const match = FRONTMATTER.exec(readFileSync(join(PATHS.agents, file), 'utf8'));
    if (!match) throw new Error(`${file}: missing YAML frontmatter`);
    const meta = parse(match[1]) as { name: string; description: string; tools: string; model?: string };
    const body = match[2].trim();
    agents[meta.name] = {
      description: meta.description,
      // Only fill bodies that use variables, and only when the caller supplied them.
      prompt: body.includes('{{') && Object.keys(vars).length ? fill(body, vars, meta.name) : body,
      tools: meta.tools.split(',').map((t) => t.trim()),
      model: ROLE_MODEL[meta.name as Role] ?? meta.model,
    };
  }
  return agents;
}

/**
 * Agents the director may spawn through the Agent tool. Module writers, reviewers and
 * simulated learners are deliberately absent: code fans those out (fixed concurrency,
 * fresh sessions), so the director cannot skip or merge them.
 */
export function directorTeam(vars: Record<string, string>) {
  const a = loadAgentFiles(vars);
  return {
    'research-librarian': { ...a['research-librarian'], maxTurns: 30 },
    'curriculum-architect': { ...a['curriculum-architect'], maxTurns: 40 },
    'media-producer': a['media-producer'],
    'script-writer': a['script-writer'],
    'assessment-designer': a['assessment-designer'],
    localizer: a.localizer,
    'course-packager': a['course-packager'],
    'marketing-writer': a['marketing-writer'],
    'metadata-tagger': { ...a['metadata-tagger'], maxTurns: 3 },
  } satisfies Record<string, AgentDefinition>;
}
