// Intake: one Jev Choice picks the worker, code enforces the confidence floor.
// No LLM call here: routing is a judgment over declared candidates, not text.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ask, choice } from './jev.ts';
import { policy, questionsFor } from './config.ts';
import { logAction } from './judgments.ts';

export type Route = 'haiku' | 'sonnet' | 'opus' | 'browser' | 'ask_user';

export function buildState(request: string) {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  return {
    request,
    repo_map: git('ls-files').split('\n').filter((f) => !f.includes('/') || f.split('/').length <= 2).slice(0, 200),
    agents_md_headings: readFileSync('AGENTS.md', 'utf8').split('\n').filter((l) => l.startsWith('#')),
    git_log_10: git('log', '--oneline', '-10'),
  };
}

export async function route(request: string): Promise<{ route: Route; reason: string }> {
  let answer;
  try {
    answer = choice(await ask('route', buildState(request), questionsFor('route')), 'worker');
  } catch (err) {
    // Jev down: default to the mid-size worker rather than block the user.
    logAction('route', 'sonnet', { reason: 'jev_error', error: String(err) });
    return { route: 'sonnet', reason: 'jev_error' };
  }

  const pick = answer.choice as Route;
  const floor = policy.route.per_candidate_min_confidence[pick] ?? policy.route.confidence_floor;
  const decided: Route = answer.confidence < policy.route.confidence_floor || answer.confidence < floor ? 'ask_user' : pick;
  const reason = decided === pick ? 'confident' : `confidence ${answer.confidence} < ${floor}`;

  logAction('route', decided, { pick, confidence: answer.confidence, reason });
  return { route: decided, reason };
}
