import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { LIMITS, MODELS } from '../config';
import { renderPrompt } from '../prompts';
import { lastJson, runAgent } from '../run-agent';

export interface Finding { area: string; issue: string; fix: string; severity: 'blocker' | 'major' | 'minor' }
interface Verdict { score: number; verdict: 'pass' | 'revise'; findings: Finding[]; praise?: string[] }

type NamedAgent = AgentDefinition & { id: string };

export interface ReviewGateOptions {
  name: string;
  producer: NamedAgent;
  evaluator: NamedAgent;
  artifact: string;
  rubric: string;
  maxRounds: number;
  passScore: number;
  escalateOnRound?: number;
  cwd: string;
}

export interface GateResult {
  outcome: 'pass' | 'escalate';
  rounds: number;
  score: number;
  costUsd: number;
  open: Finding[];
  artifact: string;
}

/**
 * Evaluator-optimizer used by every department (design, art, code, audio, world).
 *   1. a FRESH evaluator session grades the artifact against the rubric (JSON verdict),
 *   2. below passScore (or any blocker) the producer fixes only the listed findings,
 *   3. hard cap of maxRounds; then the producer agent escalates to a human.
 * The evaluator never sees its own earlier sessions, only the previous findings list,
 * so it cannot anchor on past praise. The producer may be upgraded to Opus when stuck.
 */
export async function reviewGate(opts: ReviewGateOptions): Promise<GateResult> {
  const { name, producer, evaluator, rubric, maxRounds, passScore, escalateOnRound, cwd } = opts;
  let artifact = opts.artifact;
  let previous: Finding[] = [];
  let costUsd = 0;
  let score = 0;

  for (let round = 1; round <= maxRounds; round++) {
    const review = await runAgent(evaluator, renderPrompt('review-round', {
      artifact,
      rubric,
      round,
      max_rounds: maxRounds,
      previous_findings: previous.length ? JSON.stringify(previous, null, 2) : 'none (first round)',
    }), { cwd, department: name, ...LIMITS.review });
    costUsd += review.costUsd;

    const v = lastJson<Verdict>(review.text);
    score = v.score;
    const blocking = v.findings.filter((f) => f.severity !== 'minor');
    console.log(`[gate:${name}] round ${round}/${maxRounds} score=${v.score} blocking=${blocking.length}`);

    if (v.score >= passScore && !blocking.some((f) => f.severity === 'blocker')) {
      return { outcome: 'pass', rounds: round, score, costUsd, open: [], artifact };
    }
    if (round === maxRounds) {
      return { outcome: 'escalate', rounds: round, score, costUsd, open: blocking, artifact };
    }

    // Optimizer step: cheap model first, smart model when the loop is stuck.
    const escalate = escalateOnRound !== undefined && round + 1 >= escalateOnRound;
    const fixer: NamedAgent = escalate ? { ...producer, model: MODELS.opus } : producer;
    const fix = await runAgent(fixer, renderPrompt('fix-round', {
      artifact,
      round,
      findings: blocking.map((f, i) => `F${i + 1} [${f.severity}] ${f.area}: ${f.issue}\n    fix: ${f.fix}`).join('\n'),
    }), { cwd, department: name, ...LIMITS.fix });
    costUsd += fix.costUsd;

    // Producers answer with the revised artifact (or a path to it) as their final message.
    artifact = fix.text.trim() || artifact;
    previous = blocking;
  }
  throw new Error('unreachable');
}
