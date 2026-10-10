import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { randomUUID } from 'node:crypto';

/**
 * The voice journal and the voice memory (#68). Opt-in, text only, never audio, on this machine:
 * ~/.config/flow-tower (or FLOW_TOWER_HOME), outside every repo and outside what /api/file can serve.
 * - voice-journal.jsonl: one line per turn (what was heard, what happened, how it went), plus later
 *   "mark" lines when a turn turns out corrected, undone or interrupted.
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
}

export interface Alias { heard: string; means: string }
export interface Note { kind: 'rule' | 'style'; text: string }
export type Suggestion = { id: string; why: string; evidence: number } & ({ kind: 'alias'; heard: string; means: string } | { kind: 'rule' | 'style'; text: string });
export interface Memory { aliases: Alias[]; notes: Note[]; pending: Suggestion[]; reviewedUpTo: number }

const MAX_JOURNAL_BYTES = 5_000_000;
const empty = (): Memory => ({ aliases: [], notes: [], pending: [], reviewedUpTo: 0 });
const clean = (s: unknown, max = 300) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export function voiceStore(dir = env.FLOW_TOWER_HOME ?? join(homedir(), '.config', 'flow-tower')) {
  const journal = join(dir, 'voice-journal.jsonl');
  const memoryFile = join(dir, 'voice-memory.json');
  const ensure = () => { if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 }); };
  const write = (file: string, text: string, append = false) => {
    ensure();
    if (append) appendFileSync(file, text, { mode: 0o600 }); else writeFileSync(file, text, { mode: 0o600 });
    chmodSync(file, 0o600); // transcripts are personal: owner only
  };

  /** Keeps the journal bounded: past the cap, the older half goes. */
  const rotate = () => {
    if (!existsSync(journal) || statSync(journal).size < MAX_JOURNAL_BYTES) return;
    const lines = readFileSync(journal, 'utf8').split('\n').filter(Boolean);
    write(journal, `${lines.slice(Math.floor(lines.length / 2)).join('\n')}\n`);
  };

  return {
    dir,
    append(raw: Record<string, unknown>) {
      const outcome = OUTCOMES.includes(raw.outcome as Outcome) ? raw.outcome as Outcome : 'done';
      const route = raw.route === 'agent' || raw.route === 'pick' ? raw.route : 'parser';
      const entry: JournalEntry = {
        ts: Number(raw.ts) || Date.now(), heard: clean(raw.heard), route, did: clean(raw.did, 600), outcome,
        ...(raw.tower ? { tower: clean(raw.tower, 120) } : {}),
        ...(typeof raw.language === 'string' ? { language: clean(raw.language, 8) } : {}),
        ...(Array.isArray(raw.tools) ? { tools: raw.tools.slice(0, 12).map((t) => clean(t, 40)) } : {}),
        ...(Number.isFinite(raw.ms) ? { ms: Math.round(Number(raw.ms)) } : {}),
        ...(Number.isFinite(raw.cost) ? { cost: Number(raw.cost) } : {}),
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
    read(since = 0): JournalEntry[] {
      if (!existsSync(journal)) return [];
      const entries = new Map<number, JournalEntry>();
      for (const line of readFileSync(journal, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const v = JSON.parse(line) as JournalEntry | { mark: number; outcome: Outcome };
          if ('mark' in v) { const e = entries.get(v.mark); if (e) e.outcome = v.outcome; } else entries.set(v.ts, v);
        } catch { /* a torn line from a crash: skip it */ }
      }
      return [...entries.values()].filter((e) => e.ts > since).sort((a, b) => a.ts - b.ts);
    },
    memory(): Memory {
      try { return { ...empty(), ...JSON.parse(readFileSync(memoryFile, 'utf8')) as Partial<Memory> }; } catch { return empty(); }
    },
    save(m: Memory) { write(memoryFile, `${JSON.stringify(m, null, 2)}\n`); },
    /** Accept or reject a pending suggestion; remove an accepted alias or note. */
    decide(m: Memory, body: { accept?: string; reject?: string; remove?: { alias?: number; note?: number } }) {
      const take = (id?: string) => {
        const i = m.pending.findIndex((p) => p.id === id);
        return i < 0 ? undefined : m.pending.splice(i, 1)[0];
      };
      const accepted = take(body.accept);
      if (accepted?.kind === 'alias') m.aliases.push({ heard: accepted.heard, means: accepted.means });
      else if (accepted) m.notes.push({ kind: accepted.kind, text: accepted.text });
      take(body.reject);
      if (body.remove?.alias !== undefined) m.aliases.splice(body.remove.alias, 1);
      if (body.remove?.note !== undefined) m.notes.splice(body.remove.note, 1);
      return m;
    },
    /** Last `days` days, for the Settings panel: is it getting better? */
    stats(days = 7) {
      const since = Date.now() - days * 86_400_000;
      const turns = this.read(since);
      const share = (o: Outcome) => (turns.length ? Math.round((100 * turns.filter((t) => t.outcome === o).length) / turns.length) : 0);
      const agent = turns.filter((t) => t.route === 'agent' && t.ms);
      return {
        days, turns: turns.length, agentTurns: agent.length,
        notUnderstood: share('not_understood'), corrected: share('corrected'), undone: share('undone'), interrupted: share('interrupted'),
        agentMs: agent.length ? Math.round(agent.reduce((a, t) => a + (t.ms ?? 0), 0) / agent.length) : undefined,
        cost: Number(turns.reduce((a, t) => a + (t.cost ?? 0), 0).toFixed(5)),
      };
    },
    forget() {
      rmSync(journal, { force: true });
      rmSync(memoryFile, { force: true });
    },
    newId: () => randomUUID().slice(0, 8),
  };
}
export type VoiceStore = ReturnType<typeof voiceStore>;
