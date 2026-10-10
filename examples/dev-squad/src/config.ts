import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from 'node:process';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

/** Root of the Dev Squad package (prompts, agents, memory live here). */
export const ROOT = resolve(import.meta.dirname, '..');

/** One model per job: Opus thinks, Sonnet builds and judges, Haiku routes and writes. */
export const MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
} as const;

export const ROLE_MODEL = {
  triage: MODELS.haiku,
  lead: MODELS.opus,
  architect: MODELS.opus,
  researcher: MODELS.sonnet,
  coder: MODELS.sonnet,
  tester: MODELS.sonnet,
  reviewer: MODELS.sonnet,
  'security-auditor': MODELS.sonnet,
  verifier: MODELS.sonnet,
  'doc-writer': MODELS.haiku,
} as const;
export type Role = keyof typeof ROLE_MODEL;

/** Hard caps per query(). The SDK stops with error_max_turns / error_max_budget_usd. */
export const LIMITS = {
  triage: { maxTurns: 2, maxBudgetUsd: 0.05 },
  quickfix: { maxTurns: 25, maxBudgetUsd: 1 },
  lead: { maxTurns: 80, maxBudgetUsd: 8 },
  review: { maxTurns: 25, maxBudgetUsd: 1.5 },
  fix: { maxTurns: 40, maxBudgetUsd: 2 },
  verify: { maxTurns: 30, maxBudgetUsd: 1.5 },
  docs: { maxTurns: 15, maxBudgetUsd: 0.3 },
  /** Whole-issue ceiling across every query; the pipeline aborts above it. */
  issueUsd: 15,
} as const;

/** Evaluator-optimizer loop: cap rounds, escalate the fixer to Opus on the last one. */
export const REVIEW = { maxRounds: 3, escalateToOpusOnRound: 3 } as const;

/** Plans above this size or with risk=high need a human sign-off before coding; at most 2 revise rounds. */
export const PLAN_GATE = { maxSteps: 6, approvalTimeoutMin: 240, maxRevisions: 2 } as const;

export const PATHS = {
  agents: resolve(ROOT, '.claude/agents'),
  prompts: resolve(ROOT, 'prompts'),
  mcp: resolve(ROOT, '.mcp.json'),
  patterns: resolve(ROOT, 'memory/patterns.md'),
  sessionLog: resolve(ROOT, 'memory/session-log.md'),
  worktrees: env.SQUAD_WORKTREES ?? '/tmp/dev-squad/worktrees',
} as const;

export const PROTECTED_BRANCHES = ['main', 'master', 'production', 'release/*'];

/**
 * Subprocess env for every query(). The TS SDK REPLACES the env, so spread the parent env.
 * DEV_SQUAD_SDK tells the shell hooks in .claude/settings.json to stand down, because
 * the same guards are registered in-process via options.hooks (no double execution).
 */
export function sdkEnv(extra: Record<string, string> = {}) {
  return {
    ...env,
    DEV_SQUAD_SDK: '1',
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1', // specialists never spawn their own agents
    CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '4',
    ...extra,
  };
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
