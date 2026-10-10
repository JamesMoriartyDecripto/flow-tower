import { mkdtempSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { voiceStore } from '../src/server/voice-memory';
import { voiceHandler } from '../src/server/voice';

/** The voice journal and what it learns (#68): local, opt-in, nothing applies until accepted. */
describe('voice journal store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-home-'));
  const store = voiceStore(dir);

  it('appends turns, corrects outcomes later, and counts them', () => {
    store.append({ ts: 1000, heard: 'vai al triaje', route: 'parser', did: 'Not understood', outcome: 'not_understood', tower: 't' });
    store.append({ ts: 2000, heard: 'livello 2', route: 'parser', did: 'L02', outcome: 'done' });
    store.mark(2000, 'undone');
    const all = store.read();
    expect(all.map((e) => e.outcome)).toEqual(['not_understood', 'undone']);
    expect(store.read(1000)).toHaveLength(1);
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
});

describe('voice journal routes', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterAll(() => servers.forEach((s) => s.close()));
  const headers = { 'Content-Type': 'application/json', 'x-flow-tower-voice': '1' };

  async function start(key?: string) {
    const store = voiceStore(mkdtempSync(join(tmpdir(), 'flow-tower-home-')));
    const review = { suggestions: [
      { kind: 'alias', heard: 'Triaje', means: 'Triage router', text: '', why: 'heard 3 times', evidence: 3 },
      { kind: 'alias', heard: 'pizza', means: 'Pizza oven', text: '', why: 'not a real name', evidence: 1 },
      { kind: 'style', heard: '', means: '', text: 'Answer in one sentence when the user interrupts.', why: 'two barge-ins', evidence: 2 },
    ] };
    const fake = (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(review) } }] }))) as unknown as typeof fetch;
    const server = createServer(voiceHandler({ key, model: 'stt', zdr: true, fetch: fake, learning: { store, names: () => ['Dev Squad', 'Triage router'] } }));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

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
});

describe('aliases in the page', () => {
  let applyAliases: typeof import('../src/app/voice/journal').applyAliases;
  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    ({ applyAliases } = await import('../src/app/voice/journal'));
  });

  it('replace whole words only, ignoring case and accents around them', () => {
    const aliases = [{ heard: 'triaje', means: 'triage' }, { heard: 'emme ci pi', means: 'MCP' }];
    expect(applyAliases('Vai al nodo del Triaje.', aliases)).toBe('Vai al nodo del triage.');
    expect(applyAliases('passiamo al livello degli emme ci pi', aliases)).toBe('passiamo al livello degli MCP');
    expect(applyAliases('triajes', aliases)).toBe('triajes');
  });
});
