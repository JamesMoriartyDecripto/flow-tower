import { loadAgentFiles } from '../agents';
import { LIMITS } from '../config';
import { lastJson, runAgent } from '../run-agent';
import type { Worktree } from '../orchestrator';

export interface Verification {
  verdict: 'ship' | 'hold';
  criteria: { text: string; met: boolean; evidence: string }[];
  suite: 'green' | 'red';
  gaps: string[];
  costUsd: number;
}

/**
 * Fresh-context verifier. Deliberately receives ONLY the issue number and the
 * branch: no plan, no reviewer verdicts, no agent summaries. It re-derives the
 * acceptance criteria from the issue itself and checks each against code + tests.
 */
export async function verify(issue: number, wt: Worktree): Promise<Verification> {
  const { verifier } = loadAgentFiles();
  const run = await runAgent(
    verifier,
    `Verify issue #${issue} is fully delivered on branch ${wt.branch}. Start from the issue, not from any summary.`,
    { cwd: wt.path, issue, permissionMode: 'dontAsk', ...LIMITS.verify },
  );
  if (!run.ok) return { verdict: 'hold', criteria: [], suite: 'red', gaps: [run.text], costUsd: run.costUsd };
  return { ...lastJson<Omit<Verification, 'costUsd'>>(run.text), costUsd: run.costUsd };
}
