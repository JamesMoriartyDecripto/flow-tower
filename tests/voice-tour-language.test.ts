import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { parseCommand } from '../src/app/voice/commands';
import type { ResolvedTower } from '../src/core/types';

let narrate: typeof import('../src/app/voice/narrate');
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  narrate = await import('../src/app/voice/narrate');
});
afterEach(() => vi.unstubAllGlobals());

const { workspace: ws } = await loadLibrary(['examples/dev-squad', 'examples/db-api-playbook', 'examples/physics-notes']);
const squad = ws.towers['dev-squad/dev-squad.tower.yaml'];

/** The user message of the one request narrateLayer sends, with the stubbed fetch in place. */
async function userMessageOf(opts: { said: string; language?: 'it' | 'en' }): Promise<string> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: {} }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await narrate.narrateLayer(squad as ResolvedTower, 0, opts);
  const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as {
    messages: { role: string; content: string }[];
  };
  return body.messages.find((m) => m.role === 'user')!.content;
}

describe('the tour language (#275)', () => {
  it('reads an Italian start phrase as it, an English one as en', () => {
    expect(parseCommand('panoramica guidata', { ws, tower: squad })).toMatchObject({ kind: 'tour', op: 'start', lang: 'it' });
    expect(parseCommand('spiegami la torre', { ws, tower: squad })).toMatchObject({ kind: 'tour', op: 'start', lang: 'it' });
    expect(parseCommand('guided tour', { ws, tower: squad })).toMatchObject({ kind: 'tour', op: 'start', lang: 'en' });
    expect(parseCommand('explain the tower', { ws, tower: squad })).toMatchObject({ kind: 'tour', op: 'start', lang: 'en' });
  });

  it('asks the narration in Italian for it', async () => {
    const msg = await userMessageOf({ said: 'panoramica guidata', language: 'it' });
    expect(msg).toContain('Language: Italian');
    expect(msg).not.toContain('Language: English');
  });

  it('asks the narration in English by default', async () => {
    const msg = await userMessageOf({ said: 'guided tour' });
    expect(msg).toContain('Language: English');
    expect(msg).not.toContain('Language: Italian');
  });
});
