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
/** Same caps as the server (voice-memory.ts): notes join every agent prompt. */
const MAX_NOTES = 20;
const MAX_NOTES_CHARS = 2000;

/** What the user accepted; loaded at start, used by the parser (aliases) and the agent (notes). */
export let memory: Memory = { aliases: [], notes: [], pending: [], reviewedUpTo: 0 };

/** Only well-formed items: a bad body (an error, a hand-edited file) must never break the parser. */
function wellFormed(m: unknown): Memory {
  const v = (m ?? {}) as Partial<Memory>;
  const str = (...xs: unknown[]) => xs.every((x) => typeof x === 'string');
  const list = <T>(xs: unknown, ok: (x: T) => boolean) => (Array.isArray(xs) ? (xs as T[]).filter((x) => !!x && typeof x === 'object' && ok(x)) : []);
  return {
    aliases: list<Alias>(v.aliases, (a) => str(a.heard, a.means)),
    notes: list<Note>(v.notes, (n) => str(n.text)),
    pending: list<Suggestion>(v.pending, (p) => str(p.id)),
    reviewedUpTo: Number(v.reviewedUpTo) || 0,
  };
}

const failure = async (r: Response) => new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);

export async function loadMemory(): Promise<{ memory: Memory; stats: Stats } | undefined> {
  const r = await fetch('/api/voice/memory').catch(() => undefined);
  if (!r?.ok) return undefined;
  const out = (await r.json().catch(() => undefined)) as { memory?: unknown; stats: Stats } | undefined;
  if (!out) return undefined;
  memory = wellFormed(out.memory);
  return { memory, stats: out.stats };
}

export async function decide(body: { accept?: string; reject?: string; remove?: { alias?: string; note?: string }; forget?: boolean }) {
  const r = await post('/memory', body);
  if (!r.ok) throw await failure(r);
  const out = (await r.json()) as { memory?: unknown; stats: Stats };
  memory = wellFormed(out.memory);
  return { memory, stats: out.stats };
}

/** The LLM pass over the new part of the journal; returns how many suggestions wait for a decision. */
export async function review(): Promise<number> {
  const r = await post('/review', {});
  if (!r.ok) throw await failure(r);
  const out = (await r.json()) as { pending?: unknown };
  memory = { ...memory, pending: wellFormed({ pending: out.pending }).pending };
  return memory.pending.length;
}

/** The last turn, so what the user does next can correct its outcome. */
let last: { ts: number; at: number; acted: boolean } | undefined;
let sinceReview = 0;
/**
 * "no, the other one", "non quello", "not that", "I said…": a correction. Commands that merely start
 * with "non" ("non mostrare…") or with "no" inside a word ("nodo triage") are not.
 */
const CORRECTION = /^(no([\s,.!?]|$)|non (quell|quest|è|e |era)|not (that|this|it)\b|wrong|sbagliato|ho detto|i said|intendevo|i meant)/;

export function record(entry: { heard: string; route: 'parser' | 'agent' | 'pick'; did: string; outcome: Outcome; tower?: string; tools?: string[]; ms?: number; cost?: number; firstAudioMs?: number }) {
  const ts = Date.now();
  last = { ts, at: performance.now(), acted: entry.outcome === 'done' };
  if (!on()) return;
  sinceReview++;
  void post('/journal', { entry: { ts, ...entry } }).catch(() => undefined);
}

/** Marks the last turn. `keep`: it can still be marked again (an interrupted turn may then be corrected). */
const mark = (outcome: Outcome, keep = false) => {
  if (!last || !on()) return;
  void post('/journal', { mark: { ts: last.ts, outcome } }).catch(() => undefined);
  if (!keep) last = undefined;
};

/**
 * Called with every new transcript before it is handled: "no, the other one" within 15 s means the last
 * turn was wrong; "back" within 6 s of an action means it was undone.
 */
export function judgeLast(transcript: string) {
  if (!last) return;
  const age = performance.now() - last.at;
  // «No, quello», "No…", 'no': Whisper may open with quotes or punctuation, and write accents decomposed.
  const said = transcript.normalize('NFC').toLowerCase().replace(/^[\s"'«»“”‘’„.,:;!?¡¿…\-–—]+/u, '');
  if (age < 15_000 && CORRECTION.test(said)) mark('corrected');
  else if (age < 6_000 && last.acted && /^(indietro|torna indietro|back|go back|annulla|undo)$/.test(norm(transcript))) mark('undone');
}

/** A barge-in: the user cut the reply short. What they say next may still correct it ("no, the other one"). */
export const interrupted = () => mark('interrupted', true);

let reviewing = false;
/**
 * At the end of a session with enough new turns, ask for suggestions in the background. One at a time;
 * the turns it covered are taken off the count, success or failure: turns recorded meanwhile still count,
 * and a failed review (it may have been paid) is not retried before `min` more turns.
 */
export async function reviewIfDue(min = 20): Promise<number> {
  if (!on() || reviewing || sinceReview < min) return 0;
  reviewing = true;
  const covered = sinceReview;
  try {
    return await review().catch(() => 0);
  } finally {
    sinceReview = Math.max(0, sinceReview - covered);
    reviewing = false;
  }
}

/** Lowercase without accents, one code unit per code unit of the input, so match positions map back. */
const fold = (s: string) => [...s].map((c) => {
  const f = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return f.length === c.length ? f : c;
}).join('');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Accepted aliases first: "triaje" becomes "triage" before the parser and the agent see it. Whole words
 * only, ignoring case and accents; never inside a name already written out ("triage" in "Triage router").
 */
export function applyAliases(text: string, aliases: Alias[] = memory.aliases) {
  let out = text;
  for (const a of Array.isArray(aliases) ? aliases : []) {
    if (typeof a?.heard !== 'string' || typeof a.means !== 'string') continue;
    const heard = fold(a.heard.trim());
    if (heard.length < 3) continue; // the server refuses these too (voice-learning.ts tooCommon)
    const folded = fold(out);
    const means = fold(a.means);
    const names: [number, number][] = [];
    for (let i = means ? folded.indexOf(means) : -1; i >= 0; i = folded.indexOf(means, i + 1)) names.push([i, i + means.length]);
    let result = '';
    let done = 0;
    for (const m of folded.matchAll(new RegExp(`(^|[^\\p{L}\\p{N}])(${escape(heard)})(?=$|[^\\p{L}\\p{N}])`, 'gu'))) {
      const from = m.index + m[1].length;
      const to = from + m[2].length;
      if (names.some(([s, e]) => from >= s && to <= e)) continue;
      result += out.slice(done, from) + a.means; // concatenated, never a replacement pattern: "$&" in a name stays text
      done = to;
    }
    out = result + out.slice(done);
  }
  return out;
}

/**
 * Accepted rules and reply style, for the agent's prompt: capped like on the server, and never more than
 * preferences (agent.ts wraps them so they cannot override its instructions or the tools).
 */
export function notesForAgent() {
  const notes = Array.isArray(memory.notes) ? memory.notes : [];
  const out: string[] = [];
  let chars = 0;
  for (const n of notes.slice(0, MAX_NOTES)) {
    if (typeof n?.text !== 'string' || chars + n.text.length > MAX_NOTES_CHARS) continue;
    chars += n.text.length;
    out.push(`- ${n.text.replace(/\s+/g, ' ')}`);
  }
  return out.join('\n');
}
