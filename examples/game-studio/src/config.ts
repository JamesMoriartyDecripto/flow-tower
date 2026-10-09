import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { parse } from 'yaml';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

/** Root of the Forge Studio package (prompts, agents, pipelines, memory live here). */
export const ROOT = resolve(import.meta.dirname, '..');

/** Opus decides and judges, Sonnet makes things, Haiku routes, tags and summarizes. */
export const MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
} as const;

export const ROLE_MODEL = {
  // direction + lead reviewers
  'creative-director': MODELS.opus,
  producer: MODELS.opus,
  'technical-director': MODELS.opus,
  'design-critic': MODELS.opus,
  'art-director': MODELS.opus,
  'code-reviewer': MODELS.opus,
  // specialists
  'market-analyst': MODELS.sonnet,
  'web-researcher': MODELS.sonnet,
  'game-designer': MODELS.sonnet,
  'economy-balancer': MODELS.sonnet,
  'narrative-writer': MODELS.sonnet,
  'concept-artist': MODELS.sonnet,
  'blender-modeler': MODELS.sonnet,
  'material-artist': MODELS.sonnet,
  rigger: MODELS.sonnet,
  animator: MODELS.sonnet,
  'world-builder': MODELS.sonnet,
  'worldgen-planner': MODELS.sonnet,
  'lighting-artist': MODELS.sonnet,
  'audio-designer': MODELS.sonnet,
  'gameplay-programmer': MODELS.sonnet,
  'tools-engineer': MODELS.sonnet,
  'perf-profiler': MODELS.sonnet,
  'ui-designer': MODELS.sonnet,
  'ux-researcher': MODELS.sonnet,
  'integration-lead': MODELS.sonnet,
  'qa-lead': MODELS.sonnet,
  'release-engineer': MODELS.sonnet,
  'marketing-lead': MODELS.sonnet,
  positioning: MODELS.sonnet,
  'web-developer': MODELS.sonnet,
  'trailer-writer': MODELS.sonnet,
  'store-page-writer': MODELS.sonnet,
  'community-manager': MODELS.sonnet,
  // cheap, high-volume
  'pitch-intake': MODELS.haiku,
  'asset-tagger': MODELS.haiku,
  'bug-triage': MODELS.haiku,
  'playtest-bot': MODELS.haiku,
  'standup-summary': MODELS.haiku,
  'release-notes': MODELS.haiku,
} as const;
export type Role = keyof typeof ROLE_MODEL;

/** Hard caps per query(). The SDK stops with error_max_turns / error_max_budget_usd. */
export const LIMITS = {
  intake: { maxTurns: 2, maxBudgetUsd: 0.05 },
  producer: { maxTurns: 150, maxBudgetUsd: 25 },
  director: { maxTurns: 40, maxBudgetUsd: 6 },
  specialist: { maxTurns: 40, maxBudgetUsd: 3 },
  dcc: { maxTurns: 60, maxBudgetUsd: 4 }, // Blender / Unreal sessions iterate on screenshots
  review: { maxTurns: 25, maxBudgetUsd: 2 },
  bot: { maxTurns: 30, maxBudgetUsd: 0.4 },
  cheap: { maxTurns: 4, maxBudgetUsd: 0.1 },
} as const;

/** Evaluator-optimizer caps. Mirrors config/quality-gates.yaml (the YAML wins at runtime). */
export const REVIEW = {
  design: { maxRounds: 3, passScore: 8 },
  concept: { maxRounds: 3, passScore: 8 },
  assets: { maxRounds: 2, passScore: 8 },
  code: { maxRounds: 3, passScore: 8, escalateOnRound: 3 },
  craft: { maxRounds: 2, passScore: 7 }, // audio, lighting, world
  regressionCycles: 2,
} as const;

/** Whole-project ceiling for one pitch-to-launch run. cost-ledger.ts aborts above it. */
export const STUDIO_BUDGET_USD = Number(env.FORGE_BUDGET_USD ?? 400);

export const PATHS = {
  agents: resolve(ROOT, '.claude/agents'),
  prompts: resolve(ROOT, 'prompts'),
  config: resolve(ROOT, 'config'),
  mcp: resolve(ROOT, '.mcp.json'),
  pipelines: resolve(ROOT, 'pipelines'),
  workspace: env.FORGE_WORKSPACE ?? '/srv/forge/emberwake',
  uproject: env.FORGE_UPROJECT ?? '/srv/forge/emberwake/Emberwake.uproject',
} as const;

/** Reads config/<name>.yaml or config/<name>.json. */
export function loadConfig<T>(name: string): T {
  for (const ext of ['yaml', 'json']) {
    const file = resolve(PATHS.config, `${name}.${ext}`);
    if (existsSync(file)) return parse(readFileSync(file, 'utf8')) as T;
  }
  throw new Error(`config/${name}.(yaml|json) not found`);
}

/**
 * Subprocess env for every query(). The SDK replaces env, so spread the parent.
 * FORGE_SDK tells the shell hooks in .claude/settings.json to stand down: the same
 * guards are registered in-process via options.hooks.
 */
export function sdkEnv(extra: Record<string, string> = {}) {
  return {
    ...env,
    FORGE_SDK: '1',
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1',
    CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '6',
    ...extra,
  };
}

/** Loads .mcp.json and expands ${VAR} placeholders from the environment. */
export function loadMcpServers(only?: string[]): Record<string, McpServerConfig> {
  const raw = readFileSync(PATHS.mcp, 'utf8').replace(/\$\{(\w+)\}/g, (_, name: string) => {
    const value = env[name];
    if (value === undefined) throw new Error(`.mcp.json needs env var ${name}`);
    return value;
  });
  const all = JSON.parse(raw).mcpServers as Record<string, McpServerConfig>;
  return only ? Object.fromEntries(Object.entries(all).filter(([k]) => only.includes(k))) : all;
}
