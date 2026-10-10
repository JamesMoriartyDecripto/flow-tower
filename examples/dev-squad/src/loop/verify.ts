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
 * The verdict is checked in code too: a red suite or an unmet criterion holds, whatever the model said.
 */
export async function verify(issue: number, wt: Worktree): Promise<Verification> {
  const { verifier } = loadAgentFiles();
  const run = await runAgent(
    verifier,
    `Verify issue #${issue} is fully delivered on branch ${wt.branch}. Start from the issue, not from any summary.`,
    { cwd: wt.path, issue, role: 'verifier', permissionMode: 'dontAsk', ...LIMITS.verify },
  );
  if (!run.ok) return { verdict: 'hold', criteria: [], suite: 'red', gaps: [run.text], costUsd: run.costUsd };
  const v = lastJson<Omit<Verification, 'costUsd'>>(run.text);
  const unmet = v.criteria.filter((c) => !c.met).map((c) => `unmet: ${c.text}`);
  const gaps = [...v.gaps, ...unmet, ...(v.suite === 'red' ? ['suite is red'] : [])];
  const ship = v.verdict === 'ship' && v.suite === 'green' && !unmet.length;
  console.log(`[verify] verdict=${ship ? 'ship' : 'hold'} criteria=${v.criteria.length - unmet.length}/${v.criteria.length} suite=${v.suite}`);
  return { ...v, verdict: ship ? 'ship' : 'hold', gaps, costUsd: run.costUsd };
}
