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

/** The short "one moment" acknowledgement (#70): phrases cached per language, played round-robin. */
describe('the "one moment" acknowledgement', () => {
  /**
   * A page whose /speak is counted, so a test can prove what was synthesized and what was replayed.
   * `texts` records every text sent to /speak, `started` every audio element that began playing, and
   * `playedAt` when each of them started, so a test can assert the order of two sentences in time.
   */
  const fakePage = (started: string[], texts: string[], n: { value: number }, playedAt: number[] = []) => {
    class FakeAudio {
      onended: (() => void) | null = null;
      constructor(readonly src: string) { started.push(this.src); }
      async play() { playedAt.push(performance.now()); setTimeout(() => this.onended?.(), 10); }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${++n.value}`, revokeObjectURL: () => {} }));
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const text = JSON.parse(init.body as string).text as string;
      texts.push(text);
      return new Response(new Blob([text]));
    });
  };
  /** The phrases of one ack language, cached in order: the first ack of a language is phrases[0]. */
  const ACK_PHRASES = {
    en: ['One moment.', 'Let me see.', 'Let me check.'],
    it: ['Un attimo.', 'Vediamo.', 'Allora, guardo.'],
    de: ['Einen Moment.', 'Mal sehen.'],
  };

  it('plays the cached phrase through the reply player, nothing when it is not cached yet', async () => {
    const started: string[] = [];
    const texts: string[] = [];
    fakePage(started, texts, { value: 0 });
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    // Before synthesis resolves there is nothing to play: ack does nothing and never waits.
    ack.warmAck('en');
    expect(ack.ack('en')).toBe(false);
    expect(started).toEqual([]);
    // Once a phrase is cached, the ack plays on its own, through the same queue/player as a reply.
    await vi.waitFor(() => expect(ack.ack('en')).toBe(true));
    await vi.waitFor(() => expect(started).toHaveLength(1));
    // Every phrase of the language was synthesized once, and the first that resolved is what played.
    await vi.waitFor(() => expect(texts).toHaveLength(ACK_PHRASES.en.length));
    expect(texts.sort()).toEqual([...ACK_PHRASES.en].sort());
  });

  it('rotates the phrases: a follow-up turn is still acknowledged, with a different phrase', async () => {
    const started: string[] = [];
    const texts: string[] = [];
    fakePage(started, texts, { value: 0 });
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    ack.warmAck('it');
    await vi.waitFor(() => expect(texts).toHaveLength(ACK_PHRASES.it.length));
    // No throttle: three back-to-back turns all get their ack, each with the next cached phrase.
    for (let turn = 0; turn < 3; turn++) {
      await vi.waitFor(() => expect(ack.ack('it')).toBe(true));
      await vi.waitFor(() => expect(agent.isSpeaking()).toBe(false));
    }
    expect(started).toHaveLength(3);
    expect(new Set(started).size).toBe(3); // never the same phrase twice in a row
    // Played from the cache: three syntheses, never one per turn.
    expect(texts).toHaveLength(ACK_PHRASES.it.length);
  });

  it('keeps the ack as first audio when the queue drains before the first real sentence (#70)', async () => {
    const started: string[] = [];
    const texts: string[] = [];
    const playedAt: number[] = [];
    fakePage(started, texts, { value: 0 }, playedAt);
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    ack.warmAck('en');
    await vi.waitFor(() => expect(ack.ack('en')).toBe(true));
    // The ack plays and drains while the LLM is still writing: the queue is empty before the sentence.
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(false));
    agent.say('Here is the answer.');
    // firstAudio()/firstAnswerAudio() are called while the turn is still active, as handle() does.
    const first = agent.firstAudio();
    const answer = agent.firstAnswerAudio();
    await vi.waitFor(() => expect(started).toHaveLength(2));
    // The ack's start is not lost by the empty-queue drain: firstAudio is still the ack, and only the
    // real sentence answers firstAnswerAudio.
    const firstAt = await first;
    expect(firstAt).toBeGreaterThanOrEqual(playedAt[0]);
    expect(firstAt).toBeLessThan(playedAt[1]);
    expect(await answer).toBeGreaterThanOrEqual(playedAt[1]);
  });

  it('plays the ack before a sentence queued after it, and the ack\'s Audio started first', async () => {
    const started: string[] = [];
    const texts: string[] = [];
    const playedAt: number[] = [];
    fakePage(started, texts, { value: 0 }, playedAt);
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    ack.warmAck('en');
    await vi.waitFor(() => expect(ack.ack('en')).toBe(true));
    agent.say('Here is the answer.');
    await vi.waitFor(() => expect(started).toHaveLength(2));
    // The sentence is synthesized last, and both audio elements played, the ack's before the sentence's.
    expect(texts.at(-1)).toBe('Here is the answer.');
    expect(started[0]).toBe('blob:1');
    expect(playedAt).toHaveLength(2);
    expect(playedAt[0]).toBeLessThanOrEqual(playedAt[1]);
  });

  it('does not retry a phrase whose synthesis failed for a while, and resetAck clears it', async () => {
    let fail = true;
    let calls = 0;
    class FakeAudio {
      onended: (() => void) | null = null;
      async play() { setTimeout(() => this.onended?.(), 5); }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:ack', revokeObjectURL: () => {} }));
    vi.stubGlobal('fetch', async () => {
      calls++;
      return fail ? new Response('{}', { status: 500 }) : new Response(new Blob(['Un attimo.']));
    });
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    ack.warmAck('it');
    await new Promise((r) => setTimeout(r, 10)); // every failed synthesis has settled
    // A failed synthesis leaves nothing cached, so ack() has nothing to play.
    expect(ack.ack('it')).toBe(false);
    expect(calls).toBe(ACK_PHRASES.it.length);
    // A down TTS must not be hit every turn: the cooldown swallows a second warm-up.
    ack.warmAck('it');
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(ACK_PHRASES.it.length);
    // resetAck() (a fresh session) clears the cooldown, and this time the synthesis works.
    ack.resetAck();
    fail = false;
    ack.warmAck('it');
    await vi.waitFor(() => expect(ack.ack('it')).toBe(true));
    expect(calls).toBeGreaterThan(ACK_PHRASES.it.length);
  });

  it('leaves a ready blob alone when the reply prefetches ahead', async () => {
    const started: string[] = [];
    const texts: string[] = [];
    fakePage(started, texts, { value: 0 });
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    // Every phrase is synthesized once and then queued: prefetch must reuse the blobs, never ask again.
    ack.warmAck('en');
    await vi.waitFor(() => expect(texts).toHaveLength(ACK_PHRASES.en.length));
    await vi.waitFor(() => expect(ack.ack('en')).toBe(true));
    agent.say('Second sentence here.');
    agent.say('Third sentence here.');
    await vi.waitFor(() => expect(started).toHaveLength(3));
    expect(texts.filter((t) => ACK_PHRASES.en.includes(t))).toHaveLength(ACK_PHRASES.en.length);
  });

  it('counts for the echo filter: its own words are not the user', async () => {
    class FakeAudio {
      onended: (() => void) | null = null;
      async play() { setTimeout(() => this.onended?.(), 10); }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:ack', revokeObjectURL: () => {} }));
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Response(new Blob([JSON.parse(init.body as string).text])));
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    ack.warmAck('it');
    await vi.waitFor(() => expect(ack.ack('it')).toBe(true));
    // The ack's first phrase is our own reply: the echo filter must hear it as ours, not the user's.
    expect(agent.isEcho('un attimo', { from: performance.now(), to: performance.now() })).toBe(true);
  });

  it('stopSpeaking() silences an ack halfway and nothing else of it plays', async () => {
    let paused = false;
    class FakeAudio {
      onended: (() => void) | null = null;
      constructor(readonly src: string) {}
      async play() { /* still speaking */ }
      pause() { paused = true; }
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:ack', revokeObjectURL: () => {} }));
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Response(new Blob([JSON.parse(init.body as string).text])));
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    ack.warmAck('de');
    await vi.waitFor(() => expect(ack.ack('de')).toBe(true));
    await vi.waitFor(() => expect(agent.isSpeaking()).toBe(true));
    agent.stopSpeaking();
    expect(paused).toBe(true);
    expect(agent.isSpeaking()).toBe(false);
  });

  it('reports the ack as played only once its sound starts, not when stopped first', async () => {
    const texts: string[] = [];
    // play() never resolves: the sound never starts, so onPlay must never fire.
    class StuckAudio {
      onended: (() => void) | null = null;
      constructor(readonly src: string) {}
      play() { return new Promise<void>(() => {}); }
      pause() {}
    }
    vi.stubGlobal('Audio', StuckAudio);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:ack', revokeObjectURL: () => {} }));
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      texts.push(JSON.parse(init.body as string).text);
      return new Response(new Blob(['Un attimo.']));
    });
    const agent = await import('../src/app/voice/agent');
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    agent.newReply();
    ack.warmAck('it');
    let heard = false;
    await vi.waitFor(() => expect(ack.ack('it', () => { heard = true; })).toBe(true));
    agent.stopSpeaking(); // Esc before it was heard
    await new Promise((r) => setTimeout(r, 20));
    expect(heard).toBe(false);
  });

  it('must not repopulate the cache from a synthesis that was in flight at resetAck()', async () => {
    const texts: string[] = [];
    let settle: (() => void) | undefined;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise<Response>((resolve) => {
      texts.push(JSON.parse(init.body as string).text);
      // Hold the first synthesis open until the test says so: it is in flight across the reset.
      settle = () => resolve(new Response('{}', { status: 500 }));
    }));
    class FakeAudio {
      onended: (() => void) | null = null;
      async play() { setTimeout(() => this.onended?.(), 5); }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:ack', revokeObjectURL: () => {} }));
    const ack = await import('../src/app/voice/ack');
    ack.resetAck();
    ack.warmAck('it');
    await new Promise((r) => setTimeout(r, 10)); // one synthesis is in flight
    ack.resetAck(); // forget everything while it is still pending
    settle?.();
    await new Promise((r) => setTimeout(r, 10));
    // The late failure must not have touched the fresh cache: ack() still has nothing to play.
    expect(ack.ack('it')).toBe(false);
  });
});

/** The ack's language and delay (#70): providers report languages differently, and the timer counts
 *  from the end of speech, not from when the transcription came back. Pure decisions, unit-tested here. */
describe('the ack language and delay', () => {
  it('normalizes the codes and names providers report', async () => {
    const { ackCode } = await import('../src/app/voice/ack');
    // The six ack languages, in every shape a provider may use, region and case included.
    expect(ackCode('it')).toBe('it');
    expect(ackCode('it-IT')).toBe('it');
    expect(ackCode('ita')).toBe('it');
    expect(ackCode('Italian')).toBe('it');
    expect(ackCode('eng')).toBe('en');
    expect(ackCode('deu')).toBe('de');
    expect(ackCode('ger')).toBe('de');
    expect(ackCode('fre')).toBe('fr');
    expect(ackCode('fra')).toBe('fr');
    expect(ackCode('spa')).toBe('es');
    expect(ackCode('por')).toBe('pt');
    expect(ackCode('english')).toBe('en');
    // A language we have no ack for, or nothing at all.
    expect(ackCode('ja')).toBeUndefined();
    expect(ackCode('nld')).toBeUndefined();
    expect(ackCode('')).toBeUndefined();
    expect(ackCode(undefined)).toBeUndefined();
  });

  it('falls back from the transcription to Settings and then to the browser', async () => {
    const { ackLanguage } = await import('../src/app/voice/ack');
    // What the clip said wins over every hint.
    expect(ackLanguage('ita', 'en', 'en-US')).toBe('it');
    expect(ackLanguage(undefined, 'en', 'it-IT')).toBe('en');
    // "auto" is not a language: the browser's is used, first two letters.
    expect(ackLanguage(undefined, 'auto', 'it-IT')).toBe('it');
    expect(ackLanguage(undefined, 'auto', 'Portuguese')).toBe('pt');
    // The fallback only helps when it is an ack language too.
    expect(ackLanguage(undefined, 'auto', 'ja-JP')).toBeUndefined();
    expect(ackLanguage(undefined, undefined, undefined)).toBeUndefined();
  });

  it('counts the delay from the end of speech, never from when handle() runs', async () => {
    const { ackDelay, ACK_DELAY_MS } = await import('../src/app/voice/ack');
    const end = 10_000;
    // Transcription took 200 ms: only the rest of the 600 ms window is left, so the ack still lands
    // 600 ms after the speech ended instead of 800 ms.
    expect(ackDelay(end, end + 200)).toBe(ACK_DELAY_MS - 200);
    // Armed at `now`, so it fires at the end of speech + ACK_DELAY_MS.
    expect(end + 200 + ackDelay(end, end + 200)).toBe(end + ACK_DELAY_MS);
    // A transcription slower than the window: the ack plays at once, never with a negative delay.
    expect(ackDelay(end, end + 900)).toBe(0);
    expect(ackDelay(end, end + 3000)).toBe(0);
    // No recorded clip (typed, hear() in tests): the full delay from handle().
    expect(ackDelay(undefined, 5_000)).toBe(ACK_DELAY_MS);
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
