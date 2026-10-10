import { loadAgentFiles } from '../agents';
import { LIMITS, REVIEW, ROLE_MODEL } from '../config';
import { renderPrompt } from '../prompts';
import { lastJson, runAgent } from '../run-agent';
import type { Worktree } from '../orchestrator';

interface Finding { file: string; line: number; issue: string; fix: string; severity?: string }
interface ReviewVerdict { verdict: 'approve' | 'changes_requested'; blocking: Finding[]; follow_ups: string[] }
interface SecurityVerdict { verdict: 'pass' | 'block'; findings: Finding[] }

export interface LoopResult {
  outcome: 'approved' | 'escalate';
  rounds: number;
  costUsd: number;
  followUps: string[];
  open: Finding[];
  /** Every blocking finding of every round, for memory promotion. */
  seen: Finding[];
}

/**
 * Evaluator-optimizer. Each round:
 *   1. reviewer (GLM) + security-auditor (DeepSeek) grade the diff IN PARALLEL (sectioning);
 *      a different model family than the coder's reviews it, Claude verifies at the end,
 *   2. the round passes when nothing blocks: the reviewer's blocking findings plus critical/high
 *      security findings. Lower security findings become follow-ups, never an empty fix list.
 *   3. otherwise the coder fixes ONLY the blocking findings,
 *   4. repeat, hard-capped at REVIEW.maxRounds; then a human takes over.
 * Evaluators get a fresh session every round so they cannot anchor on their own past praise.
 */
export async function reviewLoop(issue: number, plan: string, wt: Worktree): Promise<LoopResult> {
  const agents = loadAgentFiles();
  let previous: Finding[] = [];
  const seen: Finding[] = [];
  let costUsd = 0;
  const followUps: string[] = [];

  for (let round = 1; round <= REVIEW.maxRounds; round++) {
    const reviewPrompt = renderPrompt('review-round', {
      round,
      max_rounds: REVIEW.maxRounds,
      issue_number: issue,
      branch: wt.branch,
      worktree: wt.path,
      plan,
      previous_findings: previous.length ? JSON.stringify(previous, null, 2) : 'none (first round)',
      round_note: round === REVIEW.maxRounds ? 'FINAL ROUND: block only for correctness or safety.' : '',
    });
    const base = { cwd: wt.path, issue, ...LIMITS.review };

    const [review, security] = await Promise.all([
      runAgent(agents.reviewer, reviewPrompt, { ...base, role: 'reviewer' }),
      runAgent(agents['security-auditor'], `Audit the diff of ${wt.branch} against origin/main.`, { ...base, role: 'security-auditor' }),
    ]);
    costUsd += review.costUsd + security.costUsd;

    const r = lastJson<ReviewVerdict>(review.text);
    const s = lastJson<SecurityVerdict>(security.text);
    const severe = (f: Finding) => f.severity === 'critical' || f.severity === 'high';
    followUps.push(...r.follow_ups, ...s.findings.filter((f) => !severe(f)).map((f) => `${f.file}:${f.line} ${f.issue}`));
    const blocking = [...r.blocking, ...s.findings.filter(severe)];
    seen.push(...blocking);

    console.log(`[review] round ${round}: reviewer=${r.verdict} security=${s.verdict} blocking=${blocking.length}`);
    blocking.forEach((f, i) => console.log(`[review]   F${i + 1} ${f.file}:${f.line} ${f.issue}`));
    if (!blocking.length) return { outcome: 'approved', rounds: round, costUsd, followUps, open: [], seen };
    if (round === REVIEW.maxRounds) return { outcome: 'escalate', rounds: round, costUsd, followUps, open: blocking, seen };

    // Optimizer step. The last fix round leaves DeepSeek for Claude Opus: cheap first, smart when stuck.
    const route = round + 1 >= REVIEW.escalateOnRound ? REVIEW.escalateTo : ROLE_MODEL.coder;
    const fix = await runAgent(agents.coder, renderPrompt('fix-round', {
      branch: wt.branch,
      round,
      max_rounds: REVIEW.maxRounds,
      blocking_findings: blocking.map((f, i) => `F${i + 1}. ${f.file}:${f.line} — ${f.issue}\n    fix: ${f.fix}`).join('\n'),
    }), { cwd: wt.path, issue, role: 'coder', route, permissionMode: 'acceptEdits', ...LIMITS.fix });
    console.log(`[fix] round=${round} model=${route.model} ok=${fix.ok}`);
    costUsd += fix.costUsd;
    previous = blocking;
  }
  throw new Error('unreachable');
}
