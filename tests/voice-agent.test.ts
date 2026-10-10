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
