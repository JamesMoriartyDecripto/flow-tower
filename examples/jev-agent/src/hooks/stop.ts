// Stop hook: the LLM asked to end its turn; Jev judges whether it is really done.
// One request carries the premature-stop shapes (as stingray does), one noul per
// "Done means" rule and one per (diff hunk, preference) pair (as jev-pref does).
// Code blocks with a FIXED nudge. Fails open: the hook can add work, never approve less.
// Runs in-process (harness) or as a command hook: JSON on stdin, exit 2 + stderr = block.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdin } from 'node:process';
import { ask, noul, type Question } from '../jev.ts';
import { policy } from '../config.ts';
import { logAction } from '../judgments.ts';

export interface StopInput { request: string; final_message: string; tool_calls: string[]; last_check?: string; blocks_this_turn: number }
export type StopVerdict = { block: false; advisories: string[] } | { block: true; nudge: string };

const SHAPES: Record<string, { instructions: string; nudge: string }> = {
  no_action: { instructions: 'The turn stopped without doing anything, although it could have acted.', nudge: 'This turn ended without acting. Do the work, or state the decision that blocks you.' },
  broken_promise: { instructions: "The final message announces an action that this turn's tool calls do not account for.", nudge: 'You announced an action that no tool call carried out. Carry it out now, or retract it.' },
  unverified_done: { instructions: 'The final message says the task is done, but no test, build or lint ran after the last edit.', nudge: 'You said done, but nothing was checked after the last edit. Run the relevant check and report its result.' },
};

export async function judgeStop(input: StopInput): Promise<StopVerdict> {
  const c = policy.completion;
  if (input.blocks_this_turn >= c.max_blocks_per_turn) return allow('max_blocks', []); // loop protection
  const md = readFileSync('AGENTS.md', 'utf8');
  const rules = bullets(md, 'Done means');
  const prefs = bullets(md, 'Preferences');
  const hunks = diffHunks();

  const qs: Record<string, Question> = {};
  for (const [id, s] of Object.entries(SHAPES)) qs[id] = { type: 'noul', instructions: s.instructions };
  rules.forEach((r, i) => (qs[`done_rule_${i}`] = { type: 'noul', instructions: `The transcript shows evidence that this rule is satisfied: ${r}` }));
  const pairs = hunks.flatMap((_, h) => prefs.map((_, p) => [h, p] as const)).slice(0, policy.preferences.max_pairs_per_stop);
  for (const [h, p] of pairs) qs[`violates_${p}_${h}`] = { type: 'noul', instructions: `Hunk h${h} introduces a violation of the preference: ${prefs[p]}` };

  let r;
  try {
    r = await ask('completion', { ...input, hunks: hunks.map((text, i) => ({ id: `h${i}`, text })) }, qs, { timeoutMs: 3000, attempts: 2 });
  } catch {
    return allow('jev_error', []); // fail open: an outage means unchecked, never "approved"
  }

  const shape = Object.keys(SHAPES).find((k) => noul(r, k) >= c.block_stop_at);
  if (shape) return block(SHAPES[shape].nudge, shape);
  const unmet = rules.filter((_, i) => noul(r, `done_rule_${i}`) <= 1 - c.done_rule_met);
  if (unmet.length) return block(`Not done yet. No evidence for:\n- ${unmet.join('\n- ')}`, 'done_rule');

  const hits = pairs.filter(([h, p]) => noul(r, `violates_${p}_${h}`) >= policy.preferences.violation);
  const blocking = hits.filter(([, p]) => prefs[p].includes('(blocking)'));
  if (blocking.length) return block(`These hunks break a blocking preference in AGENTS.md:\n${blocking.map(([h, p]) => `- h${h}: ${prefs[p]}`).join('\n')}`, 'preference');
  return allow('clean', hits.map(([h, p]) => `advisory h${h}: ${prefs[p]}`));
}

const allow = (reason: string, advisories: string[]): StopVerdict => (logAction('completion', 'allow', { reason, advisories: advisories.length }), { block: false, advisories });
const block = (nudge: string, reason: string): StopVerdict => (logAction('completion', 'block', { reason }), { block: true, nudge });

function bullets(md: string, heading: string): string[] {
  const body = md.split(new RegExp(`^## ${heading}\\s*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';
  return body.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
}

function diffHunks(): string[] {
  const diff = execFileSync('git', ['diff', '-U3', 'HEAD'], { encoding: 'utf8' });
  return diff.split(/^(?=@@ )/m).slice(1, 21).map((h) => h.slice(0, 1500)); // 20 hunks max, 1.5k chars each
}

// Command-hook entry point.
if (import.meta.url === `file://${argv[1]}`) {
  let raw = '';
  for await (const chunk of stdin) raw += chunk;
  const v = await judgeStop(JSON.parse(raw));
  if (v.block) { stderr.write(v.nudge + '\n'); exit(2); }
  exit(0);
}
