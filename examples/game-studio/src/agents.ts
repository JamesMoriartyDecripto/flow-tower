import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { PATHS, ROLE_MODEL, type Role } from './config';
import { renderPrompt } from './prompts';

export type StudioAgent = AgentDefinition & { id: string };

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
let cache: Record<string, StudioAgent> | undefined;

/**
 * Turns .claude/agents/*.md into programmatic AgentDefinitions. The same files work
 * in interactive Claude Code; here model and tools are pinned so a stray edit cannot
 * silently widen an agent's permissions or upgrade it to a pricier model.
 */
export function loadAgentFiles(): Record<string, StudioAgent> {
  if (cache) return cache;
  cache = {};
  for (const file of readdirSync(PATHS.agents).filter((f) => f.endsWith('.md'))) {
    const match = FRONTMATTER.exec(readFileSync(join(PATHS.agents, file), 'utf8'));
    if (!match) throw new Error(`${file}: missing YAML frontmatter`);
    const meta = parse(match[1]) as { name: string; description: string; tools: string; model?: string };
    cache[meta.name] = {
      id: meta.name,
      description: meta.description,
      prompt: match[2].trim(),
      tools: meta.tools.split(',').map((t) => t.trim()).filter(Boolean),
      model: ROLE_MODEL[meta.name as Role] ?? meta.model,
    };
  }
  return cache;
}

export const agent = (id: string): StudioAgent => {
  const found = loadAgentFiles()[id];
  if (!found) throw new Error(`unknown agent file: .claude/agents/${id}.md`);
  return found;
};

/** Agents without a file: their system prompt is a template rendered per run. */
export function promptAgent(
  id: Role, description: string, tools: string[], vars: Record<string, string | number>,
): StudioAgent {
  return { id, description, prompt: renderPrompt(id, vars), tools, model: ROLE_MODEL[id] };
}

/**
 * Who the producer may delegate to, per department. Reviewers are deliberately
 * absent: evaluators always run later, in fresh sessions (see loop/review-gate.ts).
 */
export const DEPARTMENTS = {
  research: ['market-analyst', 'web-researcher'],
  preproduction: ['game-designer', 'economy-balancer', 'narrative-writer'],
  art: ['concept-artist', 'blender-modeler', 'material-artist', 'rigger'],
  engine: ['animator', 'lighting-artist', 'audio-designer'],
  world: ['world-builder'],
  engineering: ['gameplay-programmer', 'tools-engineer', 'ui-designer', 'perf-profiler'],
  release: ['release-engineer'],
} as const satisfies Record<string, string[]>;
export type Department = keyof typeof DEPARTMENTS;

export function departmentTeam(dept: Department): Record<string, AgentDefinition> {
  const files = loadAgentFiles();
  return Object.fromEntries(DEPARTMENTS[dept].map((id) => {
    const { id: _id, ...def } = files[id];
    // DCC agents edit real scenes: accept edits, but every write still passes the hooks.
    const dcc = ['blender-modeler', 'material-artist', 'rigger', 'world-builder', 'gameplay-programmer'].includes(id);
    return [id, dcc ? { ...def, permissionMode: 'acceptEdits' as const } : def];
  }));
}

/** The full studio roster for the producer's query(): every department, no reviewers. */
export function studioTeam(): Record<string, AgentDefinition> {
  return Object.assign({}, ...(Object.keys(DEPARTMENTS) as Department[]).map(departmentTeam));
}
