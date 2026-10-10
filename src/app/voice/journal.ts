import { usePrefs } from '../settings';
import { norm } from './commands';

/**
 * The page side of the voice journal (#68). Only when Settings > Voice > Learn from my sessions is on:
 * each turn is written with what was heard and what happened, and its outcome is corrected later from
 * what the user does next. The memory the user accepted (aliases, notes) is loaded at each start.
 */
export type Outcome = 'done' | 'not_understood' | 'corrected' | 'undone' | 'interrupted' | 'error';
export interface Alias { heard: string; means: string }
export interface Note { kind: 'rule' | 'style'; text: string }
export type Suggestion = { id: string; why: string; evidence: number } & ({ kind: 'alias'; heard: string; means: string } | { kind: 'rule' | 'style'; text: string });
export interface Memory { aliases: Alias[]; notes: Note[]; pending: Suggestion[]; reviewedUpTo: number }
export interface Stats {
  days: number; turns: number; agentTurns: number; notUnderstood: number; corrected: number; undone: number; interrupted: number;
  agentMs?: number; firstAudioMs?: number; cost: number; reviews: number; reviewCost: number;
}

const HEADER = { 'Content-Type': 'application/json', 'x-flow-tower-voice': '1' };
const on = () => usePrefs.getState().voiceJournal;
const post = (path: string, body: unknown) => fetch(`/api/voice${path}`, { method: 'POST', headers: HEADER, body: JSON.stringify(body) });

/** What the user accepted; loaded at start, used by the parser (aliases) and the agent (notes). */
export let memory: Memory = { aliases: [], notes: [], pending: [], reviewedUpTo: 0 };

export async function loadMemory(): Promise<{ memory: Memory; stats: Stats } | undefined> {
  const r = await fetch('/api/voice/memory').catch(() => undefined);
  if (!r?.ok) return undefined;
  const out = (await r.json()) as { memory: Memory; stats: Stats };
  memory = out.memory;
  return out;
}

export async function decide(body: { accept?: string; reject?: string; remove?: { alias?: number; note?: number }; forget?: boolean }) {
  const r = await post('/memory', body);
  const out = (await r.json()) as { memory: Memory; stats: Stats };
  memory = out.memory;
  return out;
}

/** The LLM pass over the new part of the journal; returns how many suggestions wait for a decision. */
export async function review(): Promise<number> {
  const r = await post('/review', {});
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  const out = (await r.json()) as { pending: Suggestion[] };
  memory = { ...memory, pending: out.pending };
  return out.pending.length;
}

/** The last turn, so what the user does next can correct its outcome. */
let last: { ts: number; at: number; acted: boolean } | undefined;
let sinceReview = 0;
const CORRECTION = /^(no\b|non\b|not that|wrong|sbagliato|ho detto|i said|intendevo|i meant)/i;

export function record(entry: { heard: string; route: 'parser' | 'agent' | 'pick'; did: string; outcome: Outcome; tower?: string; tools?: string[]; ms?: number; cost?: number; firstAudioMs?: number }) {
  const ts = Date.now();
  last = { ts, at: performance.now(), acted: entry.outcome === 'done' };
  if (!on()) return;
  sinceReview++;
  void post('/journal', { entry: { ts, ...entry } }).catch(() => undefined);
}

const mark = (outcome: Outcome) => {
  if (!last || !on()) return;
  void post('/journal', { mark: { ts: last.ts, outcome } }).catch(() => undefined);
  last = undefined;
};

/**
 * Called with every new transcript before it is handled: "no, the other one" within 15 s means the last
 * turn was wrong; "back" within 6 s of an action means it was undone.
 */
export function judgeLast(transcript: string) {
  if (!last) return;
  const age = performance.now() - last.at;
  const text = norm(transcript);
  if (age < 15_000 && CORRECTION.test(text)) mark('corrected');
  else if (age < 6_000 && last.acted && /^(indietro|torna indietro|back|go back|annulla|undo)$/.test(text)) mark('undone');
}

/** A barge-in: the user cut the reply short. */
export const interrupted = () => mark('interrupted');

/** At the end of a session with enough new turns, ask for suggestions in the background. */
export async function reviewIfDue(min = 20): Promise<number> {
  if (!on() || sinceReview < min) return 0;
  sinceReview = 0;
  return review().catch(() => 0);
}

/** Accepted aliases first: "triaje" becomes "triage" before the parser and the agent see it. */
export function applyAliases(text: string, aliases: Alias[] = memory.aliases) {
  let out = text;
  for (const a of aliases) {
    const heard = a.heard.trim();
    if (!heard) continue;
    out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu'), `$1${a.means}`);
  }
  return out;
}

/** Accepted rules and reply style, for the agent's prompt. */
export const notesForAgent = () => memory.notes.map((n) => `- ${n.text}`).join('\n');
