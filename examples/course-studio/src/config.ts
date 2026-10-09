import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { parse } from 'yaml';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

/** Root of the Syllabus Forge package (prompts, agents, config, memory live here). */
export const ROOT = resolve(import.meta.dirname, '..');

/** Opus where judgment compounds, Sonnet for production, Haiku for routing and tags. */
export const MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
} as const;

export const ROLE_MODEL = {
  intake: MODELS.haiku,
  director: MODELS.opus,
  'curriculum-architect': MODELS.opus,
  'research-librarian': MODELS.sonnet,
  'module-writer': MODELS.sonnet,
  localizer: MODELS.sonnet,
  'script-writer': MODELS.sonnet,
  'media-producer': MODELS.sonnet,
  'assessment-designer': MODELS.sonnet,
  'pedagogy-reviewer': MODELS.opus,
  'fact-checker': MODELS.sonnet,
  'accessibility-auditor': MODELS.sonnet,
  'rights-reviewer': MODELS.opus,
  consolidator: MODELS.opus,
  'learner-simulator': MODELS.sonnet,
  'course-packager': MODELS.sonnet,
  'marketing-writer': MODELS.sonnet,
  'metadata-tagger': MODELS.haiku,
  'claim-extractor': MODELS.haiku,
} as const;
export type Role = keyof typeof ROLE_MODEL;

/** Hard caps per query(). The SDK stops with error_max_turns / error_max_budget_usd. */
export const LIMITS = {
  intake: { maxTurns: 2, maxBudgetUsd: 0.05 },
  director: { maxTurns: 120, maxBudgetUsd: 40 },
  writer: { maxTurns: 40, maxBudgetUsd: 2.5 },
  review: { maxTurns: 30, maxBudgetUsd: 1.5 },
  pilot: { maxTurns: 150, maxBudgetUsd: 3 },
  packager: { maxTurns: 25, maxBudgetUsd: 1 },
  /** Whole-course ceiling across every query; the pipeline aborts above it. */
  courseUsd: 60,
} as const;

/** Evaluator-optimizer: hard cap, and the revision before the last round runs on Opus. */
export const REVIEW = { maxRounds: 3, escalateToOpusOnRound: 3 } as const;
export const CONCURRENCY = { modules: 3, reviewers: 4, personas: 3 } as const;

export const PATHS = {
  agents: resolve(ROOT, '.claude/agents'),
  prompts: resolve(ROOT, 'prompts'),
  mcp: resolve(ROOT, '.mcp.json'),
  gates: resolve(ROOT, 'config/quality-gates.yaml'),
  readingLevels: resolve(ROOT, 'config/reading-levels.yaml'),
  patterns: resolve(ROOT, 'memory/patterns.md'),
  sessionLog: resolve(ROOT, 'memory/session-log.md'),
  runs: env.FORGE_RUNS_DIR ?? resolve(ROOT, 'runs'),
} as const;

/** Thresholds shared by hooks, loops and QC. One file, reviewed in PRs. */
export const GATES = parse(readFileSync(PATHS.gates, 'utf8')) as {
  research: { min_sources_per_question: number; min_primary: number };
  reading: { tolerance_grade: number };
  review: { max_rounds: number };
  pilot: { p_min: number; p_max: number; discrimination_min: number; max_critical_friction: number };
  packaging: { mastery_score: number };
  [k: string]: unknown;
};

export interface Run { slug: string; dir: string; startedAt: string }

/** Every agent is fenced into runs/<slug>/; config, templates and memory stay read-only. */
export function createRun(slug: string): Run {
  const dir = resolve(PATHS.runs, slug);
  for (const sub of ['sources', 'research', 'design', 'lessons', 'media', 'assessment/keys', 'marketing', 'package']) {
    mkdirSync(resolve(dir, sub), { recursive: true });
  }
  return { slug, dir, startedAt: new Date().toISOString() };
}

/**
 * Subprocess env for every query(). The TS SDK REPLACES the env, so spread the parent env.
 * FORGE_SDK tells the shell hooks in .claude/settings.json to stand down (hooks run in-process).
 */
export function sdkEnv(extra: Record<string, string> = {}) {
  return { ...env, FORGE_SDK: '1', CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1', ...extra };
}

/** Loads .mcp.json and expands ${VAR} placeholders from the environment. */
export function loadMcpServers(): Record<string, McpServerConfig> {
  const raw = readFileSync(PATHS.mcp, 'utf8').replace(/\$\{(\w+)\}/g, (_, name: string) => {
    const value = env[name];
    if (value === undefined) throw new Error(`.mcp.json needs env var ${name}`);
    return value;
  });
  return JSON.parse(raw).mcpServers;
}
