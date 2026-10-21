import { beforeAll, describe, expect, it, vi } from 'vitest';

let agent: typeof import('../src/app/voice/agent');
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  agent = await import('../src/app/voice/agent');
});

/** A player that plays each sentence for a few ms, and a /speak that echoes the text as the blob. */
const fakePage = (failing: string[] = []) => {
  class FakeAudio {
    onended: (() => void) | null = null;
    constructor(readonly src: string) {}
    async play() { setTimeout(() => this.onended?.(), 5); }
    pause() {}
  }
  vi.stubGlobal('Audio', FakeAudio);
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} }));
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const text = JSON.parse(init.body as string).text as string;
    // A sentence whose synthesis fails: /speak answers an error, the player skips it.
    if (failing.includes(text)) return new Response('{}', { status: 500 });
    return new Response(new Blob([text]));
  });
};

describe('speech hooks for the guided tour', () => {
  it('runs each sentence onPlay in order as it plays, and never for a sentence whose synthesis failed', async () => {
    fakePage(['Frase rotta.']);
    agent.newReply();
    const heard: string[] = [];
    agent.say('Prima frase.', () => heard.push('Prima frase.'));
    agent.say('Frase rotta.', () => heard.push('Frase rotta.'));
    agent.say('Terza frase.', () => heard.push('Terza frase.'));
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(false));
    expect(heard).toEqual(['Prima frase.', 'Terza frase.']);
  });

  it('still resolves the first answer when a sentence is queued with onPlay', async () => {
    fakePage();
    agent.newReply();
    let heard = false;
    agent.say('Una risposta.', () => { heard = true; });
    // Asked while the reply is active, as handle() does: asked before say() it would answer "not spoken".
    const answer = agent.firstAnswerAudio();
    expect(await answer).toBeTypeOf('number');
    expect(heard).toBe(true);
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(false));
  });

  it('drained() resolves at once when nothing is queued', async () => {
    agent.newReply();
    expect(agent.isSpeaking()).toBe(false);
    await expect(agent.drained()).resolves.toBeUndefined();
  });

  it('drained() resolves after the last sentence ends, and every waiter resolves once', async () => {
    fakePage();
    agent.newReply();
    agent.say('Prima frase.'); agent.say('Ultima frase.');
    const waits = [agent.drained(), agent.drained()];
    let settled = 0;
    for (const w of waits) void w.then(() => settled++);
    await Promise.all(waits);
    expect(agent.isSpeaking()).toBe(false);
    expect(settled).toBe(2);
  });

  it('drained() resolves when stopSpeaking() cuts the reply short', async () => {
    // play() never resolves: the sentence is stuck, so only stopSpeaking() can end the reply.
    class Stuck {
      onended: (() => void) | null = null;
      constructor(readonly src: string) {}
      play() { return new Promise<void>(() => {}); }
      pause() {}
    }
    vi.stubGlobal('Audio', Stuck);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:stuck', revokeObjectURL: () => {} }));
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Response(new Blob([JSON.parse(init.body as string).text])));
    agent.newReply();
    agent.say('Una frase che non finisce.');
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(true));
    const done = agent.drained();
    agent.stopSpeaking();
    await expect(done).resolves.toBeUndefined();
    expect(agent.isSpeaking()).toBe(false);
  });
});
