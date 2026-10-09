// Minimal System One client used by every decision node.
// Wire format follows the TypeSafe API reference (docs.typesafe.ai/api):
//   POST https://api.typesafe.ai/v1/systemone  { state, model, questions }
//   -> { model, answers, usage: { input_tokens, output_tokens } }
// The official SDK (@typesafe-ai/sdk, TypeSafeClient.systemOne) does the same;
// a raw fetch keeps the timeout and fail-open behaviour in our hands.
import { env } from 'node:process';
import { logJudgment } from './judgments.ts';

export type Question =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export interface SystemOneResult {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

const URL = env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai/v1/systemone';
// Pinned, not jev-latest: every threshold in config/policy.yaml was tuned on this version.
const MODEL = env.JEV_MODEL ?? 'jev-1.13.0';
// The API reference asks for exponential backoff on 429 (rate limit) and 529 (overloaded).
const RETRYABLE = new Set([429, 529]);

export class JevError extends Error {}

export async function ask(
  decision: string,
  state: unknown,
  questions: Record<string, Question>,
  { timeoutMs = 2000, attempts = 3 } = {},
): Promise<SystemOneResult> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ state, model: MODEL, questions }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const result = validate((await res.json()) as SystemOneResult, questions);
      logJudgment(decision, result, Date.now() - started);
      return result;
    }
    if (!RETRYABLE.has(res.status) || attempt >= attempts) throw new JevError(`systemone ${res.status}`);
    await new Promise((r) => setTimeout(r, 2 ** attempt * 100 + Math.random() * 100));
  }
}

// Typed output is the point of Jev, but we still refuse to act on a malformed answer:
// a missing key or an out-of-range probability throws, and the caller falls back.
function validate(result: SystemOneResult, questions: Record<string, Question>): SystemOneResult {
  for (const [id, q] of Object.entries(questions)) {
    const a = result.answers?.[id];
    if (!a || a.type !== q.type) throw new JevError(`missing or mistyped answer: ${id}`);
    if (a.type === 'noul' && !(a.noul >= 0 && a.noul <= 1)) throw new JevError(`noul out of range: ${id}`);
    if (a.type === 'choice' && !(a.choice in (q as { criteria: object }).criteria)) {
      throw new JevError(`choice outside declared candidates: ${id}`);
    }
  }
  return result;
}

export const noul = (r: SystemOneResult, id: string) => (r.answers[id] as Extract<Answer, { type: 'noul' }>).noul;
export const choice = (r: SystemOneResult, id: string) => r.answers[id] as Extract<Answer, { type: 'choice' }>;
