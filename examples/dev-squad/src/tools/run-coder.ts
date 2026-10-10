import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { loadAgentFiles } from '../agents';
import { LIMITS } from '../config';
import { runAgent } from '../run-agent';

/** Spend of OpenRouter coder runs per worktree; the lead report adds it to the SDK's own total. */
const spend = new Map<string, number>();
export const takeCoderSpend = (cwd: string) => {
  const usd = spend.get(cwd) ?? 0;
  spend.delete(cwd);
  return usd;
};

/**
 * How the lead delegates a plan step when the coder runs on OpenRouter: SDK subagents can only
 * be Claude models, so the step runs as its own tool loop in the worktree and, like a subagent,
 * only the coder's report comes back to the lead's context.
 */
export const runCoder = (cwd: string) => tool(
  'run_coder',
  'Implement ONE plan step in the issue worktree with the coder agent. Returns its STATUS report.',
  {
    issue: z.number().int().positive().describe('The issue being delivered'),
    step: z.string().min(10).max(8_000).describe('The step text, the relevant research brief and the files to touch'),
  },
  async ({ issue, step }) => {
    const run = await runAgent(loadAgentFiles().coder, step, { cwd, issue, role: 'coder', ...LIMITS.step });
    spend.set(cwd, (spend.get(cwd) ?? 0) + run.costUsd);
    return { content: [{ type: 'text', text: run.text }], isError: !run.ok };
  },
);
