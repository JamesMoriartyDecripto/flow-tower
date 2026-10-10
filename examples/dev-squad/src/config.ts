import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from 'node:process';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

/** Root of the Dev Squad package (prompts, agents, memory live here). */
export const ROOT = resolve(import.meta.dirname, '..');

/** Claude for judgment (lead, architect, verifier), other model families for the bulk work. */
export const MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
  deepseek: 'deepseek/deepseek-v4-pro-0813',
  glm: 'z-ai/glm-5.3',
} as const;

/** Where a role thinks: the Claude Agent SDK, or an OpenRouter tool loop (src/openrouter-agent.ts). */
export interface RoleModel { provider: 'claude' | 'openrouter'; model: string }
const claude = (model: string): RoleModel => ({ provider: 'claude', model });
const openrouter = (model: string): RoleModel => ({ provider: 'openrouter', model });

/**
 * Cross-model review: GLM (Z.ai) reviews what DeepSeek wrote, so the evaluator does not share
 * the coder's blind spots; Claude plans, arbitrates and verifies with a fresh context.
 */
export const ROLE_MODEL = {
  triage: claude(MODELS.haiku),
  lead: claude(MODELS.opus),
  architect: claude(MODELS.opus),
  researcher: claude(MODELS.sonnet),
  coder: openrouter(MODELS.deepseek),
  tester: claude(MODELS.sonnet),
  reviewer: openrouter(MODELS.glm),
  'security-auditor': openrouter(MODELS.deepseek),
  verifier: claude(MODELS.opus),
  'doc-writer': claude(MODELS.haiku),
} satisfies Record<string, RoleModel>;
export type Role = keyof typeof ROLE_MODEL;

/** Hard caps per query(). The SDK stops with error_max_turns / error_max_budget_usd. */
export const LIMITS = {
  triage: { maxTurns: 2, maxBudgetUsd: 0.05 },
  quickfix: { maxTurns: 25, maxBudgetUsd: 1 },
  /** One plan step for an OpenRouter coder (run_coder): round 1 of #70 took 50 steps and $0.13. */
  step: { maxTurns: 60, maxBudgetUsd: 1 },
  lead: { maxTurns: 80, maxBudgetUsd: 8 },
  review: { maxTurns: 25, maxBudgetUsd: 1.5 },
  fix: { maxTurns: 40, maxBudgetUsd: 2 },
  verify: { maxTurns: 30, maxBudgetUsd: 1.5 },
  docs: { maxTurns: 15, maxBudgetUsd: 0.3 },
  /** Whole-issue ceiling across every query; the pipeline aborts above it. */
  issueUsd: 15,
} as const;

/** Evaluator-optimizer loop: cap rounds; the last fix round leaves OpenRouter for Claude Opus. */
export const REVIEW = { maxRounds: 3, escalateOnRound: 3, escalateTo: claude(MODELS.opus) } as const;

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
