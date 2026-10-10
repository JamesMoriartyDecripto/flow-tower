import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { voiceStore } from '../src/server/voice-memory';
import { voiceHandler } from '../src/server/voice';
import { isSecretPath, readTowerFile } from '../src/server/files';

/** The voice journal and what it learns (#68): local, opt-in, nothing applies until accepted. */
describe('voice journal store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-home-'));
  const store = voiceStore(dir);

  it('appends turns, corrects outcomes later, and counts them', () => {
    const t = Date.now() - 60_000;
    store.append({ ts: t + 1000, heard: 'vai al triaje', route: 'parser', did: 'Not understood', outcome: 'not_understood', tower: 't' });
    store.append({ ts: t + 2000, heard: 'livello 2', route: 'parser', did: 'L02', outcome: 'done' });
    store.mark(t + 2000, 'undone');
    const all = store.read();
    expect(all.map((e) => e.outcome)).toEqual(['not_understood', 'undone']);
    expect(store.read(t + 1000)).toHaveLength(1);
    // Time to first audio: a number, kept; anything else, dropped; averaged in the stats.
    store.append({ ts: t + 3000, heard: 'spiegami', route: 'agent', did: 'Ok.', outcome: 'done', ms: 900, firstAudioMs: 1234.4 });
    store.append({ ts: t + 4000, heard: 'e poi', route: 'agent', did: 'Ok.', outcome: 'done', ms: 900, firstAudioMs: '5' });
    expect(store.read(t + 2000).map((e) => e.firstAudioMs)).toEqual([1234, undefined]);
    expect(store.stats().firstAudioMs).toBe(1234);
    // The "one moment" acknowledgement (#70): kept only when exactly true.
    store.append({ ts: t + 5000, heard: 'e poi', route: 'agent', did: 'Ok.', outcome: 'done', ms: 900, ack: true });
    store.append({ ts: t + 6000, heard: 'e poi', route: 'agent', did: 'Ok.', outcome: 'done', ms: 900, ack: 'yes' });
    expect(store.read(t + 4000).map((e) => e.ack)).toEqual([true, undefined]);
    // Personal: readable by the owner only.
    expect(statSync(join(dir, 'voice-journal.jsonl')).mode & 0o777).toBe(0o600);
  });

  it('applies only what the user accepts, and forgets everything on request', () => {
    const m = store.memory();
    m.pending.push({ id: 'a1', kind: 'alias', heard: 'triaje', means: 'Triage router', why: 'misheard', evidence: 3 });
    m.pending.push({ id: 'n1', kind: 'style', text: 'Shorter answers.', why: 'interrupted', evidence: 2 });
    store.save(store.decide(m, { accept: 'a1' }));
    store.save(store.decide(store.memory(), { reject: 'n1' }));
    expect(store.memory()).toMatchObject({ aliases: [{ heard: 'triaje', means: 'Triage router' }], notes: [], pending: [] });
    store.forget();
    expect(store.read()).toEqual([]);
    expect(store.memory().aliases).toEqual([]);
  });

  it('keeps the cost and latency of each stage and where the user was, sanitized', () => {
    const t = Date.now() - 10_000;
    store.append({ ts: t, heard: 'spiegami', route: 'agent', did: 'Ok.', outcome: 'done', ms: 900, cost: 0.002, sttMs: 412.6, sttCost: 0.0005,
      language: 'it', layer: 'intake\nlayer', node: 'triage' });
    store.append({ ts: t + 1, heard: 'livello due', route: 'parser', did: 'L02', outcome: 'done', sttMs: -3, sttCost: 'free', layer: 42, node: '' });
    store.append({ ts: t + 2, heard: 'livello tre', route: 'parser', did: 'L03', outcome: 'done', sttMs: 588, sttCost: 0.0005 });
    const [a, b] = store.read(t - 1);
    expect(a).toMatchObject({ sttMs: 413, sttCost: 0.0005, language: 'it', layer: 'intake layer', node: 'triage' });
    expect(b).not.toHaveProperty('sttMs');
    expect(b).not.toHaveProperty('sttCost');
    expect(b).not.toHaveProperty('layer');
    expect(b).not.toHaveProperty('node');
    expect(store.stats()).toMatchObject({ sttMs: 501, cost: 0.003, costPerTurn: 0.001 });
    expect(store.unreviewed()).toBe(3);
    store.save({ ...store.memory(), reviewedUpTo: t });
    expect(store.unreviewed()).toBe(2);
    store.forget();
  });

  it('takes a turn time from the page only within [now - 1 day, now + 1 min]', () => {
    const now = Date.now();
    const at = (ts: unknown) => {
      store.forget();
      return store.append({ ts, heard: 'x', route: 'parser', did: 'x', outcome: 'done' })!.ts;
    };
    expect(at(now - 5000)).toBe(now - 5000);
    for (const ts of [1000, now + 3_600_000, 'soon']) expect(Math.abs(at(ts) - now), String(ts)).toBeLessThan(5000);
    store.forget();
  });

  it('caps accepted notes, removes by value, and keeps the folder and files owner-only', () => {
    const m = store.memory();
    for (let i = 0; i < 20; i++) m.notes.push({ kind: 'rule', text: `rule ${i}` });
    m.aliases.push({ heard: 'triaje', means: 'Triage router' }, { heard: 'emme ci pi', means: 'MCP' });
    m.pending.push({ id: 'n21', kind: 'rule', text: 'one more', why: '', evidence: 1 });
    expect(() => store.decide(m, { accept: 'n21' })).toThrow(/at most 20 notes/);
    store.save(store.decide(m, { remove: { alias: 'triaje', note: 'rule 3' } }));
    const after = store.memory();
    expect(after.aliases.map((a) => a.heard)).toEqual(['emme ci pi']);
    expect(after.notes.map((n) => n.text)).not.toContain('rule 3');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'voice-memory.json')).mode & 0o777).toBe(0o600);
    // A hand-edited file with junk in it: the junk is dropped, the rest survives.
    writeFileSync(join(dir, 'voice-memory.json'), JSON.stringify({ aliases: [null, 3, { heard: 'x1y', means: 'Y' }], notes: 'no', pending: [{}] }));
    expect(store.memory()).toEqual({ aliases: [{ heard: 'x1y', means: 'Y' }], notes: [], pending: [], reviewedUpTo: 0 });
    store.forget();
  });
});

describe('voice journal routes', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterAll(() => servers.forEach((s) => s.close()));
  const headers = { 'Content-Type': 'application/json', 'x-flow-tower-voice': '1' };

  const review = { suggestions: [
    { kind: 'alias', heard: 'Triaje', means: 'Triage router', text: '', why: 'heard 3 times', evidence: 3 },
    { kind: 'alias', heard: 'pizza', means: 'Pizza oven', text: '', why: 'not a real name', evidence: 1 },
    { kind: 'style', heard: '', means: '', text: 'Answer in one sentence when the user interrupts.', why: 'two barge-ins', evidence: 2 },
  ] };
  /** OpenRouter answering a review: `content` is the model's message, `cost` its usage. */
  const reply = (content: string, cost?: number) => new Response(JSON.stringify({ choices: [{ message: { content } }], ...(cost !== undefined && { usage: { cost } }) }));

  async function start(key?: string, fake = (async () => reply(JSON.stringify(review))) as unknown as typeof fetch, store = voiceStore(mkdtempSync(join(tmpdir(), 'flow-tower-home-')))) {
    const server = createServer(voiceHandler({ key, model: 'stt', zdr: true, fetch: fake, learning: { store, names: () => ['Dev Squad', 'Triage router'] } }));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const poster = (url: string) => (path: string, body: unknown) => fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const heardOnce = { entry: { heard: 'vai al triaje', route: 'parser', did: 'Not understood', outcome: 'not_understood', tower: 't' } };

  it('writes the journal without a key, reviews with one, and keeps only real aliases', async () => {
    const url = await start('sk-or-test');
    const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    expect((await post('/journal', { entry: { heard: 'vai al triaje', route: 'parser', did: 'Not understood', outcome: 'not_understood', tower: 't' } })).status).toBe(200);
    const r = await (await post('/review', {})).json();
    expect(r.reviewed).toBe(1);
    expect(r.pending.map((p: { kind: string; heard?: string; means?: string }) => p.kind === 'alias' ? `${p.heard}→${p.means}` : p.kind)).toEqual(['triaje→Triage router', 'style']);
    const id = r.pending[0].id;
    const after = await (await post('/memory', { accept: id })).json();
    expect(after.memory.aliases).toEqual([{ heard: 'triaje', means: 'Triage router' }]);
    expect((await (await fetch(`${url}/memory`)).json()).stats.turns).toBe(1);
    // Nothing new since the last review: no second LLM call.
    expect((await (await post('/review', {})).json()).reviewed).toBe(0);
  });

  it('keeps the journal and memory to this page', async () => {
    const url = await start();
    expect((await fetch(`${url}/journal`, { method: 'POST', headers, body: JSON.stringify({ entry: { heard: 'x', did: 'y' } }) })).status).toBe(200); // no key needed
    expect((await fetch(`${url}/memory`, { headers: { Origin: 'http://localhost:3000' } })).status).toBe(403);
    expect((await fetch(`${url}/review`, { method: 'POST', headers, body: '{}' })).status).toBe(503); // the review needs the key
  });

  it('keeps decisions made while a review runs', async () => {
    const store = voiceStore(mkdtempSync(join(tmpdir(), 'flow-tower-home-')));
    const m = store.memory();
    m.pending.push({ id: 'old', kind: 'rule', text: 'Layer two means the Triage layer.', why: 'corrected twice', evidence: 2 });
    store.save(m);
    // The user accepts the waiting suggestion while the model is still thinking.
    const fake = (async () => {
      store.save(store.decide(store.memory(), { accept: 'old' }));
      return reply(JSON.stringify(review));
    }) as unknown as typeof fetch;
    const post = poster(await start('sk-or-test', fake, store));
    await post('/journal', heardOnce);
    expect((await post('/review', {})).status).toBe(200);
    const after = store.memory();
    expect(after.notes).toEqual([{ kind: 'rule', text: 'Layer two means the Triage layer.' }]);
    expect(after.pending.map((p) => p.id)).not.toContain('old');
    expect(after.pending).toHaveLength(2);
    expect(after.reviewedUpTo).toBeGreaterThan(0);
  });

  it('does not move past entries the model could not review, and counts what reviews cost', async () => {
    const store = voiceStore(mkdtempSync(join(tmpdir(), 'flow-tower-home-')));
    const sent: Record<string, unknown>[] = [];
    let content = 'Sorry, I cannot help with that.';
    const fake = (async (_: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return reply(content, 0.0021);
    }) as unknown as typeof fetch;
    const post = poster(await start('sk-or-test', fake, store));
    await post('/journal', heardOnce);
    expect((await post('/review', {})).status).toBe(502);
    expect(store.memory().reviewedUpTo).toBe(0);
    expect(sent[0].usage).toEqual({ include: true });
    // A valid empty review still covers the entries.
    content = JSON.stringify({ suggestions: [] });
    expect((await (await post('/review', {})).json()).reviewed).toBe(1);
    expect(store.memory().reviewedUpTo).toBeGreaterThan(0);
    expect(store.stats()).toMatchObject({ reviews: 2, reviewCost: 0.0042, turns: 1, cost: 0 });
  });

  it('reviews the oldest unreviewed entries first, so none is skipped', async () => {
    const store = voiceStore(mkdtempSync(join(tmpdir(), 'flow-tower-home-')));
    const t = Date.now() - 300_000;
    for (let i = 1; i <= 205; i++) store.append({ ts: t + i, heard: `turno ${i}`, route: 'parser', did: 'x', outcome: 'done' });
    const sizes: number[] = [];
    const fake = (async (_: string, init: RequestInit) => {
      const user = JSON.parse(String(init.body)).messages[1].content;
      sizes.push(JSON.parse(user).journal.length);
      return reply(JSON.stringify({ suggestions: [] }));
    }) as unknown as typeof fetch;
    const post = poster(await start('sk-or-test', fake, store));
    expect((await (await post('/review', {})).json()).reviewed).toBe(200);
    expect(store.memory().reviewedUpTo).toBe(t + 200);
    expect((await (await post('/review', {})).json()).reviewed).toBe(5);
    expect(sizes).toEqual([200, 5]);
  });

  it('refuses aliases on short or common words, which would rewrite every transcript', async () => {
    const aliases = ['it', 'the', 'di', 'il nodo', 'del'].map((heard) => ({ kind: 'alias', heard, means: 'Triage router', text: '', why: '', evidence: 9 }));
    const fake = (async () => reply(JSON.stringify({ suggestions: [...aliases, review.suggestions[0]] }))) as unknown as typeof fetch;
    const post = poster(await start('sk-or-test', fake));
    await post('/journal', heardOnce);
    const r = await (await post('/review', {})).json();
    expect(r.pending.map((p: { heard: string }) => p.heard)).toEqual(['triaje']);
  });

  it('counts unreviewed turns in its answers, and shows the reviewer where the user was', async () => {
    const store = voiceStore(mkdtempSync(join(tmpdir(), 'flow-tower-home-')));
    let sent = '';
    const fake = (async (_: string, init: RequestInit) => { sent = JSON.parse(String(init.body)).messages[1].content; return reply('{"suggestions":[]}'); }) as unknown as typeof fetch;
    const url = await start('sk-or-test', fake, store);
    const post = poster(url);
    const entry = { heard: 'vai al triaje', route: 'parser', did: 'Not understood', outcome: 'not_understood', tower: 't', layer: 'intake', node: 'triage' };
    expect(await (await post('/journal', { entry })).json()).toEqual({ ok: true, unreviewed: 1 });
    expect((await (await post('/journal', { entry: { ...entry, heard: 'e poi' } })).json()).unreviewed).toBe(2);
    expect((await (await fetch(`${url}/memory`)).json()).unreviewed).toBe(2);
    expect((await (await post('/review', {})).json()).unreviewed).toBe(0);
    expect(JSON.parse(sent).journal[0]).toMatchObject({ heard: 'vai al triaje', layer: 'intake', node: 'triage' });
  });

  it('refuses an alias that is a word of the name it means, or of another real name', async () => {
    const aliases = [['triage', 'Triage router'], ['router', 'Dev Squad'], ['dev squad', 'Triage router'], ['triaje', 'Triage router']]
      .map(([heard, means]) => ({ kind: 'alias', heard, means, text: '', why: '', evidence: 3 }));
    const post = poster(await start('sk-or-test', (async () => reply(JSON.stringify({ suggestions: aliases }))) as unknown as typeof fetch));
    await post('/journal', heardOnce);
    const r = await (await post('/review', {})).json();
    expect(r.pending.map((p: { heard: string }) => p.heard)).toEqual(['triaje']);
  });

  it('answers a refused decision with an error, not a memory', async () => {
    const store = voiceStore(mkdtempSync(join(tmpdir(), 'flow-tower-home-')));
    const m = store.memory();
    for (let i = 0; i < 20; i++) m.notes.push({ kind: 'rule', text: `rule ${i}` });
    m.pending.push({ id: 'n21', kind: 'rule', text: 'one more', why: '', evidence: 1 });
    store.save(m);
    const post = poster(await start(undefined, undefined, store));
    const r = await post('/memory', { accept: 'n21' });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: expect.stringMatching(/at most 20 notes/) });
    expect(store.memory().pending).toHaveLength(1);
  });
});

describe('the user folder is never served (#68)', () => {
  const saved = env.FLOW_TOWER_HOME;
  afterAll(() => { if (saved === undefined) delete env.FLOW_TOWER_HOME; else env.FLOW_TOWER_HOME = saved; });

  it('refuses the journal even when FLOW_TOWER_HOME is inside a tower root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'flow-tower-root-'));
    mkdirSync(join(root, 'home'));
    writeFileSync(join(root, 'home', 'voice-journal.jsonl'), '{"heard":"x"}\n');
    writeFileSync(join(root, 'notes.md'), 'x');
    env.FLOW_TOWER_HOME = join(root, 'home');
    expect((await readTowerFile(root, 'home/voice-journal.jsonl')).status).toBe(403);
    expect((await readTowerFile(root, 'notes.md')).status).toBe(200);
    expect(isSecretPath('/Users/me/.config/flow-tower/voice-memory.json')).toBe(true);
    expect(isSecretPath('.config/flow-tower-docs/x.md')).toBe(false);
  });
});

describe('aliases in the page', () => {
  let journal: typeof import('../src/app/voice/journal');
  let applyAliases: typeof journal.applyAliases;
  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    journal = await import('../src/app/voice/journal');
    ({ applyAliases } = journal);
  });
  afterAll(() => vi.unstubAllGlobals());

  it('never rewrite inside the name they mean, keep "$" in names as text, and ignore accents', () => {
    expect(applyAliases('vai al nodo triage router', [{ heard: 'router', means: 'triage router' }])).toBe('vai al nodo triage router');
    expect(applyAliases('router e poi triage router', [{ heard: 'router', means: 'triage router' }])).toBe('triage router e poi triage router');
    expect(applyAliases('apri il costo', [{ heard: 'costo', means: 'Cost $& $1 tracker' }])).toBe('apri il Cost $& $1 tracker');
    expect(applyAliases('vai al nodo perché', [{ heard: 'perche', means: 'Why node' }])).toBe('vai al nodo Why node');
    expect(applyAliases('Vai al TRIAJÉ', [{ heard: 'triaje', means: 'triage' }])).toBe('Vai al triage');
  });

  it('survive a bad memory: an error body never becomes the memory', async () => {
    expect(applyAliases('ciao', [null, { heard: 3 }] as never)).toBe('ciao');
    expect(applyAliases('ciao', 'junk' as never)).toBe('ciao');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'at most 20 notes' }), { status: 409 }));
    await expect(journal.decide({ accept: 'x' })).rejects.toThrow('at most 20 notes');
    expect(journal.memory.aliases).toEqual([]);
    expect(journal.notesForAgent()).toBe('');
  });

  it('cap the notes the agent sees', async () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ kind: 'rule', text: `${'x'.repeat(150)} ${i}` }));
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ memory: { aliases: [], notes, pending: [] }, stats: {} })));
    await journal.loadMemory();
    const lines = journal.notesForAgent().split('\n');
    expect(lines.length).toBeLessThanOrEqual(20);
    expect(lines.join('').length).toBeLessThanOrEqual(2000 + 3 * 20);
  });

  it('take "no, …" as a correction, but not a command that starts with "non"', async () => {
    const { usePrefs } = await import('../src/app/settings');
    usePrefs.getState().set({ voiceJournal: true });
    const marks: unknown[] = [];
    vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.mark) marks.push(body.mark.outcome);
      return new Response('{}');
    });
    journal.record({ heard: 'livello due', route: 'parser', did: 'L02', outcome: 'done' });
    journal.judgeLast('non mostrare i nodi');
    journal.judgeLast('nodo triage');
    expect(marks).toEqual([]);
    // A barge-in, then "no, the other one": interrupted, and still corrected.
    journal.interrupted();
    journal.judgeLast('No, il terzo');
    expect(marks).toEqual(['interrupted', 'corrected']);
  });

  it('read a correction behind quotes and punctuation', async () => {
    const marks: unknown[] = [];
    vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.mark) marks.push(body.mark.outcome);
      return new Response('{}');
    });
    for (const said of ['«No, il secondo»', '"no quello"', '… non quello', 'Non e\u0300 quello']) {
      journal.record({ heard: 'livello due', route: 'parser', did: 'L02', outcome: 'done' });
      journal.judgeLast(said);
    }
    expect(marks).toEqual(['corrected', 'corrected', 'corrected', 'corrected']);
  });

  it('count unreviewed turns on the server (a reload keeps them), one review at a time, back off after a failure', async () => {
    // A fake server: it counts the turns written since the last successful review.
    let unreviewed = 0;
    let reviews = 0;
    let answer!: (r: Response) => void;
    vi.stubGlobal('fetch', async (url: string) => {
      const path = String(url);
      if (path.endsWith('/memory')) return new Response(JSON.stringify({ memory: { aliases: [], notes: [], pending: [] }, stats: {}, unreviewed }));
      if (path.endsWith('/journal')) return new Response(JSON.stringify({ ok: true, unreviewed: ++unreviewed }));
      reviews++;
      return new Promise<Response>((r) => { answer = r; });
    });
    const turn = () => journal.record({ heard: 'livello due', route: 'parser', did: 'L02', outcome: 'done' });
    const settle = () => new Promise((r) => setTimeout(r, 10)); // the journal POSTs answer asynchronously
    // After a reload the page has recorded nothing, but the server has 25 turns waiting: a review is due.
    unreviewed = 25;
    await journal.loadMemory();
    const first = journal.reviewIfDue();
    expect(await journal.reviewIfDue()).toBe(0); // a second mic-off while the first runs
    for (let i = 0; i < 5; i++) turn(); // turns while it runs
    await settle();
    await vi.waitFor(() => expect(reviews).toBe(1));
    unreviewed = 5; // what the server still counts after the review: the 5 written meanwhile
    answer(new Response(JSON.stringify({ pending: [], unreviewed })));
    await first;
    for (let i = 0; i < 15; i++) turn(); // 5 + 15 = 20: due again
    await settle();
    const failed = journal.reviewIfDue();
    await vi.waitFor(() => expect(reviews).toBe(2));
    answer(new Response(JSON.stringify({ error: 'review failed: the model sent no readable suggestions' }), { status: 502 }));
    expect(await failed).toBe(0);
    turn();
    await settle();
    expect(await journal.reviewIfDue()).toBe(0); // no retry right away: 20 more turns first
    expect(reviews).toBe(2);
  });

  it('replace whole words only, ignoring case and accents around them', () => {
    const aliases = [{ heard: 'triaje', means: 'triage' }, { heard: 'emme ci pi', means: 'MCP' }];
    expect(applyAliases('Vai al nodo del Triaje.', aliases)).toBe('Vai al nodo del triage.');
    expect(applyAliases('passiamo al livello degli emme ci pi', aliases)).toBe('passiamo al livello degli MCP');
    expect(applyAliases('triajes', aliases)).toBe('triajes');
  });
});
