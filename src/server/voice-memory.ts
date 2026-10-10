import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pid } from 'node:process';
import { userHome } from '../core/secrets.ts';

/**
 * The voice journal and the voice memory (#68). Opt-in, text only, never audio, on this machine:
 * ~/.config/flow-tower (or FLOW_TOWER_HOME), outside every repo and outside what /api/file can serve.
 * - voice-journal.jsonl: one line per turn (what was heard, what happened, how it went), plus later
 *   "mark" lines when a turn turns out corrected, undone or interrupted, and "review" lines (entries, cost).
 * - voice-memory.json: what the user accepted from reviews (aliases for misheard names, rules, reply
 *   style), the suggestions waiting for a decision, and how far the journal was reviewed.
 */
export const OUTCOMES = ['done', 'not_understood', 'corrected', 'undone', 'interrupted', 'error'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface JournalEntry {
  ts: number;
  heard: string;
  route: 'parser' | 'agent' | 'pick';
  did: string;
  outcome: Outcome;
  tower?: string;
  language?: string;
  tools?: string[];
  ms?: number;
  cost?: number;
  /** Agent turns: from the end of the transcript to the first audible sound (the ack counts). */
  firstAudioMs?: number;
  /** Agent turns: from the end of the transcript to the first real spoken sentence (the ack excluded). */
  firstAnswerMs?: number;
  /** Agent turns: the short "one moment" acknowledgement actually started playing before the first sentence (#70). */
  ack?: boolean;
  /** Speech to text: how long the transcription took, and what it cost. */
  sttMs?: number;
  sttCost?: number;
  /** Where the user was when they spoke: the focused layer and the selected node (ids). */
  layer?: string;
  node?: string;
}
/** One review of the journal: how many entries it read and what it cost. */
export interface ReviewRecord { review: number; entries: number; cost?: number }

export interface Alias { heard: string; means: string }
export interface Note { kind: 'rule' | 'style'; text: string }
export type Suggestion = { id: string; why: string; evidence: number } & ({ kind: 'alias'; heard: string; means: string } | { kind: 'rule' | 'style'; text: string });
export interface Memory { aliases: Alias[]; notes: Note[]; pending: Suggestion[]; reviewedUpTo: number }

const MAX_JOURNAL_BYTES = 5_000_000;
/** Accepted notes join every agent prompt: a few short ones, not a second system prompt (the page caps them too). */
export const MAX_NOTES = 20;
export const MAX_NOTES_CHARS = 2000;
/** A turn's time comes from the page: anything outside [now - 1 day, now + 1 min] is replaced by now. */
const turnTime = (ts: unknown, now = Date.now()) => {
  const n = Number(ts);
  return Number.isFinite(n) && n >= now - 86_400_000 && n <= now + 60_000 ? n : now;
};
const list = <T>(v: unknown, ok: (x: T) => boolean): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => !!x && typeof x === 'object' && ok(x)) : []);
/** A duration from the page: a finite number of ms, at least 0, rounded; anything else is left out. */
const ms = (key: string, v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? { [key]: Math.round(v) } : {});
const empty = (): Memory => ({ aliases: [], notes: [], pending: [], reviewedUpTo: 0 });
const clean = (s: unknown, max = 300) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export function voiceStore(dir = userHome()) {
  const journal = join(dir, 'voice-journal.jsonl');
  const memoryFile = join(dir, 'voice-memory.json');
  /** Owner only, where we may decide it; a file system that refuses chmod (EPERM) is not an error. */
  const ownerOnly = (path: string, mode: number) => { try { chmodSync(path, mode); } catch { /* best effort */ } };
  const ensure = () => {
    // Created here, or our own default folder: owner only. A folder the user chose (FLOW_TOWER_HOME) that
    // already exists keeps the permissions they gave it; the files inside are 0600 either way.
    if (!existsSync(dir)) { mkdirSync(dir, { recursive: true, mode: 0o700 }); ownerOnly(dir, 0o700); }
    else if (resolve(dir) === join(homedir(), '.config', 'flow-tower')) ownerOnly(dir, 0o700);
  };
  const write = (file: string, text: string, append = false) => {
    ensure();
    if (append) {
      appendFileSync(file, text, { mode: 0o600 });
      ownerOnly(file, 0o600);
      return;
    }
    // Whole-file writes (memory, rotation) go through a temp file and a rename: a crash never leaves half
    // a file. Windows can refuse a rename for a moment (EPERM/EBUSY: an antivirus, an indexer): one retry.
    const tmp = `${file}.${pid}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      writeFileSync(tmp, text, { mode: 0o600 });
      try { renameSync(tmp, file); } catch (err) {
        if (!['EPERM', 'EBUSY'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err;
        renameSync(tmp, file);
      }
    } finally {
      rmSync(tmp, { force: true }); // gone after a rename; removed after a failure
    }
  };

  /** Keeps the journal bounded: past the cap, the older half goes. */
  const rotate = () => {
    if (!existsSync(journal) || statSync(journal).size < MAX_JOURNAL_BYTES) return;
    const lines = readFileSync(journal, 'utf8').split('\n').filter(Boolean);
    write(journal, `${lines.slice(Math.floor(lines.length / 2)).join('\n')}\n`);
  };

  const parse = () => {
    const entries = new Map<number, JournalEntry>();
    const reviews: ReviewRecord[] = [];
    if (!existsSync(journal)) return { entries: [], reviews };
    for (const line of readFileSync(journal, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const v = JSON.parse(line) as JournalEntry | ReviewRecord | { mark: number; outcome: Outcome };
        if ('mark' in v) { const e = entries.get(v.mark); if (e) e.outcome = v.outcome; } else if ('review' in v) reviews.push(v); else entries.set(v.ts, v);
      } catch { /* a torn line from a crash: skip it */ }
    }
    return { entries: [...entries.values()].sort((a, b) => a.ts - b.ts), reviews };
  };
  let forgotten = 0;
  const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length) : undefined);

  return {
    dir,
    append(raw: Record<string, unknown>) {
      const outcome = OUTCOMES.includes(raw.outcome as Outcome) ? raw.outcome as Outcome : 'done';
      const route = raw.route === 'agent' || raw.route === 'pick' ? raw.route : 'parser';
      const entry: JournalEntry = {
        ts: turnTime(raw.ts), heard: clean(raw.heard), route, did: clean(raw.did, 600), outcome,
        ...(raw.tower ? { tower: clean(raw.tower, 120) } : {}),
        ...(typeof raw.language === 'string' ? { language: clean(raw.language, 8) } : {}),
        ...(Array.isArray(raw.tools) ? { tools: raw.tools.slice(0, 12).map((t) => clean(t, 40)) } : {}),
        ...(Number.isFinite(raw.ms) ? { ms: Math.round(Number(raw.ms)) } : {}),
        ...(Number.isFinite(raw.cost) ? { cost: Number(raw.cost) } : {}),
        ...ms('firstAudioMs', raw.firstAudioMs), ...ms('firstAnswerMs', raw.firstAnswerMs), ...ms('sttMs', raw.sttMs),
        ...(raw.ack === true ? { ack: true } : {}),
        ...(Number.isFinite(raw.sttCost) && Number(raw.sttCost) >= 0 ? { sttCost: Number(raw.sttCost) } : {}),
        ...(typeof raw.layer === 'string' && raw.layer ? { layer: clean(raw.layer, 80) } : {}),
        ...(typeof raw.node === 'string' && raw.node ? { node: clean(raw.node, 80) } : {}),
      };
      if (!entry.heard) return undefined;
      write(journal, `${JSON.stringify(entry)}\n`, true);
      rotate();
      return entry;
    },
    /** A turn's outcome learned later ("no, the other one", "back", a barge-in): appended, applied on read. */
    mark(ts: number, outcome: Outcome) {
      if (!OUTCOMES.includes(outcome) || !Number.isFinite(ts)) return;
      write(journal, `${JSON.stringify({ mark: ts, outcome })}\n`, true);
    },
    /** A review that ran: its cost counts in the stats, like the turns'. */
    reviewed(entries: number, cost?: number) {
      write(journal, `${JSON.stringify({ review: Date.now(), entries, ...(Number.isFinite(cost) && { cost }) })}\n`, true);
    },
    read(since = 0): JournalEntry[] { return parse().entries.filter((e) => e.ts > since); },
    /** Turns not reviewed yet: the page's automatic review counts these, so a reload does not reset it. */
    unreviewed() { return this.read(this.memory().reviewedUpTo).length; },
    reviews(since = 0): ReviewRecord[] { return parse().reviews.filter((r) => r.review > since); },
    /** What is on disk, with anything malformed dropped (a hand-edited file must not break the routes). */
    memory(): Memory {
      try {
        const m = JSON.parse(readFileSync(memoryFile, 'utf8')) as Partial<Memory>;
        const str = (...v: unknown[]) => v.every((x) => typeof x === 'string');
        return {
          aliases: list<Alias>(m.aliases, (a) => str(a.heard, a.means)),
          notes: list<Note>(m.notes, (n) => str(n.text) && (n.kind === 'rule' || n.kind === 'style')),
          pending: list<Suggestion>(m.pending, (p) => str(p.id) && (p.kind === 'alias' ? str(p.heard, p.means) : str(p.text))),
          reviewedUpTo: Number(m.reviewedUpTo) || 0,
        };
      } catch { return empty(); }
    },
    save(m: Memory) { write(memoryFile, `${JSON.stringify(m, null, 2)}\n`); },
    /**
     * Accept or reject a pending suggestion; remove an accepted alias (by what it hears) or note (by its
     * text): values, not positions, so a decision made on a stale list cannot remove the wrong one.
     * Throws when accepting one more note would pass the cap.
     */
    decide(m: Memory, body: { accept?: string; reject?: string; remove?: { alias?: string; note?: string } }) {
      const next = m.pending.find((p) => p.id === body.accept);
      if (next && next.kind !== 'alias') {
        const chars = m.notes.reduce((a, n) => a + n.text.length, 0) + next.text.length;
        if (m.notes.length >= MAX_NOTES || chars > MAX_NOTES_CHARS) throw new Error(`at most ${MAX_NOTES} notes and ${MAX_NOTES_CHARS} characters: remove one first`);
      }
      const take = (id?: string) => {
        const i = m.pending.findIndex((p) => p.id === id);
        return i < 0 ? undefined : m.pending.splice(i, 1)[0];
      };
      const accepted = take(body.accept);
      if (accepted?.kind === 'alias') m.aliases.push({ heard: accepted.heard, means: accepted.means });
      else if (accepted) m.notes.push({ kind: accepted.kind, text: accepted.text });
      take(body.reject);
      if (typeof body.remove?.alias === 'string') m.aliases = m.aliases.filter((a) => a.heard !== body.remove!.alias);
      if (typeof body.remove?.note === 'string') m.notes = m.notes.filter((n) => n.text !== body.remove!.note);
      return m;
    },
    /** Last `days` days, for the Settings panel: is it getting better? */
    stats(days = 7) {
      const since = Date.now() - days * 86_400_000;
      const turns = this.read(since);
      const share = (o: Outcome) => (turns.length ? Math.round((100 * turns.filter((t) => t.outcome === o).length) / turns.length) : 0);
      const agent = turns.filter((t) => t.route === 'agent' && t.ms);
      const reviews = this.reviews(since);
      return {
        days, turns: turns.length, agentTurns: agent.length,
        notUnderstood: share('not_understood'), corrected: share('corrected'), undone: share('undone'), interrupted: share('interrupted'),
        agentMs: average(agent.map((t) => t.ms ?? 0)),
        firstAudioMs: average(turns.flatMap((t) => (t.firstAudioMs === undefined ? [] : [t.firstAudioMs]))),
        // The same, up to the first real sentence: the ack shortens the silence, never the LLM+synthesis time.
        firstAnswerMs: average(turns.flatMap((t) => (t.firstAnswerMs === undefined ? [] : [t.firstAnswerMs]))),
        sttMs: average(turns.flatMap((t) => (t.sttMs === undefined ? [] : [t.sttMs]))),
        // Every stage a turn paid for: transcription and the agent (speech synthesis reports no cost).
        cost: Number(turns.reduce((a, t) => a + (t.cost ?? 0) + (t.sttCost ?? 0), 0).toFixed(5)),
        costPerTurn: turns.length ? Number((turns.reduce((a, t) => a + (t.cost ?? 0) + (t.sttCost ?? 0), 0) / turns.length).toFixed(6)) : 0,
        reviews: reviews.length,
        reviewCost: Number(reviews.reduce((a, r) => a + (r.cost ?? 0), 0).toFixed(5)),
      };
    },
    forget() {
      forgotten++;
      rmSync(journal, { force: true });
      rmSync(memoryFile, { force: true });
    },
    /** Bumped by forget(): a review that outlives it must not write anything back. */
    forgets: () => forgotten,
    newId: () => randomUUID().slice(0, 8),
  };
}
export type VoiceStore = ReturnType<typeof voiceStore>;
