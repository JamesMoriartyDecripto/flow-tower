// Every Jev judgment is logged with its probabilities, and later joined with what
// actually happened (approved, declined, re-planned, stop was right). Without this
// log the thresholds in config/policy.yaml are guesses; with it they are measured.
import { appendFileSync } from 'node:fs';
import { env } from 'node:process';
import type { SystemOneResult } from './jev.ts';

const LOG = env.JEV_JUDGMENT_LOG ?? 'logs/judgments.log';
const RUN = env.AGENT_RUN_ID ?? 'local';

export function logJudgment(decision: string, r: SystemOneResult, latencyMs: number): void {
  const answers = Object.fromEntries(
    Object.entries(r.answers).map(([id, a]) =>
      a.type === 'noul' ? [id, { noul: round(a.noul) }] : [id, { pick: a.type === 'choice' ? a.choice : round(a.score), p: a.probabilities, conf: round(a.confidence) }],
    ),
  );
  write({ kind: 'judgment', decision, model: r.model, answers, latency_ms: latencyMs, input_tokens: r.usage.input_tokens });
}

// The deterministic action code took (allow / warn / hold / block, route, keep...).
export function logAction(decision: string, action: string, detail: Record<string, unknown> = {}): void {
  write({ kind: 'action', decision, action, ...detail });
}

// Ground truth arrives later: a human reply, a re-run, a reverted commit.
export function logOutcome(decision: string, outcome: string, ref: string): void {
  write({ kind: 'outcome', decision, outcome, ref });
}

function write(entry: Record<string, unknown>): void {
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), run: RUN, ...entry }) + '\n');
}

const round = (x: number) => Math.round(x * 1000) / 1000;
