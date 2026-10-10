import { beforeAll, describe, expect, it, vi } from 'vitest';

let wantsAgent: typeof import('../src/app/voice/agent').wantsAgent;
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  ({ wantsAgent } = await import('../src/app/voice/agent'));
});

describe('spoken replies', () => {
  it('play one sentence at a time, in order, never on top of each other', async () => {
    const started: string[] = [];
    let live = 0;
    let most = 0;
    class FakeAudio {
      onended: (() => void) | null = null;
      constructor(readonly src: string) {}
      async play() {
        live++; most = Math.max(most, live); started.push(this.src);
        setTimeout(() => { live--; this.onended?.(); }, 5);
      }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Response(new Blob([JSON.parse(init.body as string).text])));
    let n = 0;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} }));
    const { say, newReply } = await import('../src/app/voice/agent');
    newReply();
    say('Prima frase.'); say('Seconda frase.'); say('Terza frase.');
    await new Promise((r) => setTimeout(r, 120));
    expect(started).toEqual(['blob:1', 'blob:2', 'blob:3']);
    expect(most).toBe(1);
  });
  it('never keep the mic deaf: a sentence that fails to decode is skipped, a blocked reply ends at once', async () => {
    const agent = await import('../src/app/voice/agent');
    const blocked: string[] = [];
    agent.onPlaybackBlocked((m) => blocked.push(m));
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Response(new Blob([JSON.parse(init.body as string).text])));
    // A sentence the browser cannot decode fires onerror after play() resolved: the next one still plays.
    const played: string[] = [];
    class Broken {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly src: string) {}
      async play() { played.push(this.src); setTimeout(() => (played.length === 1 ? this.onerror : this.onended)?.(), 5); }
      pause() {}
    }
    vi.stubGlobal('Audio', Broken);
    agent.newReply();
    agent.say('Una frase rotta.'); agent.say('Una frase buona.');
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(false));
    expect(played).toHaveLength(2);
    // Autoplay blocked: told once, and the reply is over (the half-duplex gate opens again).
    class Refused {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      async play() { throw Object.assign(new Error('no autoplay'), { name: 'NotAllowedError' }); }
      pause() {}
    }
    vi.stubGlobal('Audio', Refused);
    agent.newReply();
    agent.say('Prima.'); agent.say('Seconda frase lunga.'); agent.say('Terza frase lunga.');
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(false));
    agent.say('Un altra risposta.');
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(false));
    expect(blocked).toHaveLength(1);
  });

  it('give up on a sentence whose synthesis hangs', async () => {
    const { speak } = await import('../src/app/voice/agent');
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const started = performance.now();
    expect(await speak('Una frase.', new AbortController().signal, 50)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('retry a 429 once, without waiting after the second', async () => {
    const { speak } = await import('../src/app/voice/agent');
    let calls = 0;
    vi.stubGlobal('fetch', async () => { calls++; return new Response('{}', { status: 429 }); });
    const started = performance.now();
    expect(await speak('Una frase.', new AbortController().signal)).toBeUndefined();
    expect(calls).toBe(2);
    expect(performance.now() - started).toBeLessThan(900); // one 500 ms pause, not two
  });
});

/** Questions reach the agent (#63); plain navigation stays with the instant local parser (#62). */
describe('voice agent routing', () => {
  it('sends questions and references to the screen to the agent', () => {
    for (const q of [
      "cosa c'è nel secondo livello?", 'a cosa è collegato questo nodo', 'fammi vedere i file di questo nodo', 'apri il primo',
      'quanti MCP ci sono?', 'what does the fresh verifier do', 'which layer has the human approvals', 'tell me about the coder',
      'Spiegami il flusso del primo livello.', 'descrivimi il livello degli MCP', 'raccontami come funziona la review', 'explain the flow of layer 2',
    ]) expect(wantsAgent(q), q).toBe(true);
  });

  it('keeps navigation with the parser', () => {
    for (const q of ['apri il progetto della dev squad', 'livello 3', 'vai al nodo del triage', 'vista mappa', 'torna alla libreria', 'open layer two']) {
      expect(wantsAgent(q), q).toBe(false);
    }
  });
});
