import type { ServerResponse } from 'node:http';
import type { JournalEntry, Memory, Outcome, Suggestion, VoiceStore } from './voice-memory.ts';

/**
 * Routes of the voice journal and its review (#68), mounted under /api/voice by voiceHandler:
 * - GET  /journal                       → { stats } of the last 7 days;
 * - POST /journal { entry } | { mark: { ts, outcome } }  append a turn, or correct its outcome later;
 * - GET  /memory                        → { memory, stats } accepted aliases and notes, pending suggestions;
 * - POST /memory { accept | reject | remove | forget }   the user's decisions;
 * - POST /review                        → { pending, reviewed }  an LLM reads the new part of the journal
 *   and proposes aliases, rules and reply style. Nothing applies until the user accepts it.
 */
export interface LearningDeps {
  store: VoiceStore;
  /** Names on screen in the reviewed towers, so an alias can only point at something real. */
  names(towerIds: string[]): string[];
  /** One chat completion through OpenRouter (key, model and ZDR handled by voiceHandler). */
  complete(body: object): Promise<Response>;
  send(res: ServerResponse, status: number, body: unknown): void;
}

const REVIEW_MAX = 200;
const PROMPT = `You review the journal of the voice assistant of Flow Tower, an app that shows software systems as 3D towers of layers and nodes. Each entry: what the speech recognizer heard, the route (parser = instant command matcher, agent = LLM with tools, pick = a numbered choice), what the app did, and the outcome (done, not_understood, corrected, undone, interrupted, error).
Propose at most 8 improvements, only where the journal shows evidence:
- alias: a word or phrase the recognizer keeps writing for a real name ("triaje" for "triage", "emme ci pi" for "MCP"). "means" must be exactly one of the names listed. heard is lowercase.
- rule: an instruction for the agent about phrasings that failed or were corrected, e.g. which command the user meant.
- style: how spoken replies should change, e.g. shorter where the user interrupted, or another language preference.
Do not repeat what is already accepted. evidence = how many entries support it. Write rules and style in English. If nothing is worth proposing, return an empty list.`;

const SCHEMA = {
  name: 'voice_review',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['suggestions'],
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['kind', 'heard', 'means', 'text', 'why', 'evidence'],
          properties: {
            kind: { type: 'string', enum: ['alias', 'rule', 'style'] },
            heard: { type: 'string', description: 'alias only, else empty' },
            means: { type: 'string', description: 'alias only: one of the names, else empty' },
            text: { type: 'string', description: 'rule or style only, else empty' },
            why: { type: 'string' },
            evidence: { type: 'integer' },
          },
        },
      },
    },
  },
};

export function learningRoutes(d: LearningDeps) {
  const { store, send } = d;
  /** One review at a time: a second click or a second tab would pay for the same entries twice. */
  let reviewing = false;
  return {
    '/journal': {
      limit: 16_000, keyless: true,
      get: (res: ServerResponse) => send(res, 200, { stats: store.stats() }),
      async run(res: ServerResponse, body: Record<string, unknown>) {
        const mark = body.mark as { ts?: number; outcome?: Outcome } | undefined;
        if (mark) { store.mark(Number(mark.ts), mark.outcome as Outcome); return send(res, 200, { ok: true }); }
        const entry = store.append((body.entry ?? {}) as Record<string, unknown>);
        send(res, entry ? 200 : 400, entry ? { ok: true } : { error: 'send { entry: { heard, route, did, outcome } }' });
      },
    },
    '/memory': {
      limit: 8_000, keyless: true,
      get: (res: ServerResponse) => send(res, 200, { memory: store.memory(), stats: store.stats() }),
      async run(res: ServerResponse, body: Record<string, unknown>) {
        if (body.forget === true) { store.forget(); return send(res, 200, { memory: store.memory(), stats: store.stats() }); }
        const m = store.decide(store.memory(), body as Parameters<VoiceStore['decide']>[1]);
        store.save(m);
        send(res, 200, { memory: m, stats: store.stats() });
      },
    },
    '/review': {
      limit: 1_000, keyless: false,
      async run(res: ServerResponse) {
        if (reviewing) return send(res, 409, { error: 'a review is already running' });
        reviewing = true;
        try { await review(res); } finally { reviewing = false; }
      },
    },
  };

  async function review(res: ServerResponse) {
    const m = store.memory();
    const entries = store.read(m.reviewedUpTo).slice(-REVIEW_MAX);
    if (!entries.length) return send(res, 200, { pending: m.pending, reviewed: 0 });
    const names = d.names([...new Set(entries.map((e) => e.tower).filter(Boolean) as string[])]);
    const forgets = store.forgets();
    const r = await d.complete({
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: JSON.stringify({
          names, accepted: { aliases: m.aliases, notes: m.notes }, waiting: m.pending.map(({ id: _, ...p }) => p),
          journal: entries.map(compact),
        }) },
      ],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 1200,
      usage: { include: true }, // the review's cost, for the stats
    });
    if (!r.ok) return send(res, 502, { error: `review failed: OpenRouter ${r.status}` });
    const out = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
    // "Forget everything" while the model was thinking: nothing from the old journal comes back.
    if (store.forgets() !== forgets) return send(res, 200, { pending: [], reviewed: 0 });
    store.reviewed(entries.length, out.usage?.cost);
    let raw: { suggestions?: unknown } | null = null;
    try { raw = JSON.parse(out.choices?.[0]?.message?.content ?? ''); } catch { /* checked below */ }
    // An unreadable reply reviewed nothing: the same entries go to the next review.
    if (!Array.isArray(raw?.suggestions)) return send(res, 502, { error: 'review failed: the model sent no readable suggestions' });
    // Decisions made while the model was thinking are in the file now: build on it, not on `m`.
    const now = store.memory();
    now.pending.push(...accept(raw.suggestions as RawSuggestion[], names, [now, m], store.newId));
    now.reviewedUpTo = Math.max(now.reviewedUpTo, entries[entries.length - 1].ts);
    store.save(now);
    send(res, 200, { pending: now.pending, reviewed: entries.length });
  }
}

interface RawSuggestion { kind: string; heard: string; means: string; text: string; why: string; evidence: number }

const compact = (e: JournalEntry) => ({ heard: e.heard, route: e.route, did: e.did.slice(0, 160), outcome: e.outcome, ...(e.language && { language: e.language }) });

/**
 * Keeps only suggestions that can work: an alias points at a real name and is new; notes are new. New
 * against every memory given: the current one, and the one the review started from (what was waiting
 * then and was rejected meanwhile must not come back).
 */
function accept(list: RawSuggestion[], names: string[], known: Memory[], id: () => string): Suggestion[] {
  const real = new Map(names.map((n) => [n.toLowerCase(), n]));
  const seen = new Set(known.flatMap((m) => [
    ...m.aliases.map((a) => `alias:${a.heard.toLowerCase()}`),
    ...m.notes.map((n) => `note:${n.text.toLowerCase()}`),
    ...m.pending.map((p) => (p.kind === 'alias' ? `alias:${p.heard.toLowerCase()}` : `note:${p.text.toLowerCase()}`)),
  ]));
  const out: Suggestion[] = [];
  for (const s of list.slice(0, 8)) {
    if (!s || typeof s !== 'object') continue;
    const why = String(s.why ?? '').slice(0, 300);
    const evidence = Math.max(0, Math.round(Number(s.evidence) || 0));
    if (s.kind === 'alias') {
      const heard = String(s.heard ?? '').toLowerCase().trim().slice(0, 60);
      const means = real.get(String(s.means ?? '').toLowerCase().trim());
      if (!heard || !means || heard === means.toLowerCase() || seen.has(`alias:${heard}`)) continue;
      seen.add(`alias:${heard}`);
      out.push({ id: id(), kind: 'alias', heard, means, why, evidence });
    } else if (s.kind === 'rule' || s.kind === 'style') {
      const text = String(s.text ?? '').trim().slice(0, 300);
      if (!text || seen.has(`note:${text.toLowerCase()}`)) continue;
      seen.add(`note:${text.toLowerCase()}`);
      out.push({ id: id(), kind: s.kind, text, why, evidence });
    }
  }
  return out;
}
