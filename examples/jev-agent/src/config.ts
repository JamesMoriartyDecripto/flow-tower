// Questions and thresholds live in YAML so a calibration PR changes numbers, not code.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { Question } from './jev.ts';

const load = (path: string) => parse(readFileSync(path, 'utf8'));

export const decisions = load('config/decisions.yaml') as Record<string, { questions?: Record<string, Question> }>;
export const policy = load('config/policy.yaml');

export const questionsFor = (decision: string): Record<string, Question> => {
  const q = decisions[decision]?.questions;
  if (!q) throw new Error(`no questions declared for ${decision}`);
  return q;
};

// Which LLM writes for each routed worker. Jev never writes text.
export const WORKER_MODEL = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
} as const;

export const BROWSER_TEXT_MODEL = 'inception/mercury-2.5'; // via OpenRouter, as in jev-ultrafast
