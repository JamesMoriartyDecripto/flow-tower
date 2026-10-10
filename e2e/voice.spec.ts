import { expect, openProject, state, test, tower, ws } from './fixtures.ts';

/**
 * The voice path without a microphone or a key (#62, #63): a transcript goes in through the dev hook
 * __flowTower.hear(), OpenRouter is answered by route interception (nothing is billed), and the test
 * checks what the user would see: the action on screen and the caption.
 */
type Hear = { __flowTower: { hear(text: string): Promise<void> } };

test('voice: a command acts at once, a question gets a streamed answer that shows what it talks about', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  let chatCalls = 0;
  await page.route('**/api/voice', (r) => r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } }));
  // Step 1 asks for the layer and its flow; step 2 answers. Both as server-sent events, like OpenRouter.
  await page.route('**/api/voice/chat', (r) => {
    chatCalls++;
    const step1 = { choices: [{ delta: { tool_calls: [
      { index: 0, id: 'c1', function: { name: 'focus_layer', arguments: '{"layer":1}' } },
      { index: 1, id: 'c2', function: { name: 'layer_nodes', arguments: '{"layer":1}' } },
    ] } }] };
    const step2 = [{ choices: [{ delta: { content: 'Il primo livello riceve le issue. ' } }] }, { choices: [{ delta: { content: 'Poi il triage le smista.' } }], usage: { cost: 0.0001 } }];
    const chunks = chatCalls === 1 ? [step1] : step2;
    r.fulfill({ contentType: 'text/event-stream', body: `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n` });
  });

  await openProject(page, id);
  await page.evaluate(async () => {
    // Vite serves the app's modules by path: the page shares them with the running app.
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    const { usePrefs } = await import(String('/src/app/settings.ts'));
    usePrefs.getState().set({ voiceReplies: false }); // no audio element in a headless test
    useVoice.setState({ status: 'listening', agent: true });
  });
  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);

  // A plain command: the local parser, no network.
  await hear('fammi vedere il terzo livello');
  expect((await state(page)).focusedLayer).toBe(2);
  expect(chatCalls).toBe(0);

  // A question: the agent focuses the first layer and answers; the caption shows the reply.
  await hear('Spiegami il flusso del primo livello.');
  expect((await state(page)).focusedLayer).toBe(0);
  expect(chatCalls).toBe(2);
  await expect(page.locator('.voice-caption .voice-heard')).toContainText('Poi il triage le smista.');
  // The node list of the focused layer is on the right.
  await expect(page.locator('.nodelist')).toContainText('Triage router');
});

test('voice journal: turns are written, a correction marks the last one, accepted aliases apply first (#68)', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  const journal: { entry?: { ts: number; heard: string; route: string; did: string; outcome: string; node?: string; layer?: string }; mark?: { ts: number; outcome: string } }[] = [];
  const memory = { aliases: [{ heard: 'smistatore', means: 'Triage router' }], notes: [], pending: [], reviewedUpTo: 0 };
  const stats = { days: 7, turns: 0, agentTurns: 0, notUnderstood: 0, corrected: 0, undone: 0, interrupted: 0, cost: 0, reviews: 0, reviewCost: 0 };
  // Every voice route answered here: nothing is billed, nothing reaches the server's journal folder.
  await page.route(/\/api\/voice(\/|\?|$)/, (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/voice/journal' && r.request().method() === 'POST') { journal.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); }
    if (path === '/api/voice/memory') return r.fulfill({ json: { memory, stats } });
    if (path === '/api/voice') return r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: true } });
    return r.fulfill({ status: 500, json: { error: `unexpected ${path} in this test` } });
  });

  await openProject(page, id);
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    const { usePrefs } = await import(String('/src/app/settings.ts'));
    const { loadMemory } = await import(String('/src/app/voice/journal.ts'));
    usePrefs.getState().set({ voiceReplies: false, voiceJournal: true });
    await loadMemory(); // what start() does when the mic turns on
    useVoice.setState({ status: 'listening', agent: true });
  });
  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);

  // "smistatore" names nothing on screen: the accepted alias makes it "Triage router" before the parser reads it.
  await hear('vai al nodo smistatore');
  const triage = tower(id).layers.flatMap((l) => l.nodes).find((n) => n.label === 'Triage router')!;
  expect((await state(page)).selected).toBe(triage.key);
  await expect(page.locator('.voice-caption')).toContainText('Triage router');
  await expect.poll(() => journal.length).toBe(1);
  const first = journal[0].entry!;
  expect(first).toMatchObject({ heard: 'vai al nodo smistatore', route: 'parser', outcome: 'done' });

  // A correction right after: the last turn is marked corrected, then the new command runs and is written too.
  await hear('no, il terzo livello');
  await expect.poll(() => journal.find((j) => j.mark)?.mark).toEqual({ ts: first.ts, outcome: 'corrected' });
  await expect.poll(() => journal.filter((j) => j.entry).length).toBe(2);
  // Where the user was when they said it: the node selected by the first command, and its layer.
  expect(journal.filter((j) => j.entry)[1].entry).toMatchObject({ node: triage.key, layer: expect.any(String) });

  // Mic off with suggestions waiting (the review runs at mic-off): the caption stays with its chip; ✕ dismisses it.
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    useVoice.setState({ status: 'off', suggestions: 2, heard: undefined, error: undefined });
  });
  await expect(page.locator('.voice-caption .voice-chip')).toHaveText('2 SUGGESTIONS');
  await page.locator('.voice-caption .voice-close').click();
  await expect(page.locator('.voice-caption')).toHaveCount(0);
});

test('voice: Esc silences the reply still being written, and the turn is journaled as interrupted', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  const entries: { outcome: string }[] = [];
  let speak = 0;
  let chat = 0;
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const sse = (chunks: object[]) => `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`;
  // Every voice route answered here: nothing is billed, nothing reaches a user folder.
  await page.route(/\/api\/voice(\/|\?|$)/, async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/voice/journal') { const b = r.request().postDataJSON(); if (b.entry) entries.push(b.entry); return r.fulfill({ json: { ok: true } }); }
    if (path === '/api/voice/memory') return r.fulfill({ json: { memory: { aliases: [], notes: [], pending: [], reviewedUpTo: 0 }, stats: {} } });
    // Speech is still being synthesized when Esc comes: Esc cancels it (no audio in this test).
    if (path === '/api/voice/speak') { speak++; await held; return r.fulfill({ status: 204 }).catch(() => undefined); }
    if (path === '/api/voice/chat') {
      // Step 1: a first sentence (spoken at once) and a tool call. Step 2 is held until Esc was pressed.
      if (++chat === 1) {
        return r.fulfill({ contentType: 'text/event-stream', body: sse([{ choices: [{ delta: { content: 'Ecco il primo livello del progetto. ', tool_calls: [{ index: 0, id: 'c1', function: { name: 'focus_layer', arguments: '{"layer":1}' } }] } }] }]) });
      }
      await held; // Esc aborts this request: answering it then may fail, which is the point
      return r.fulfill({ contentType: 'text/event-stream', body: sse([{ choices: [{ delta: { content: 'Riceve le issue. Poi il triage le smista. ' } }] }]) }).catch(() => undefined);
    }
    return r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: true } });
  });

  await openProject(page, id);
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    const { usePrefs } = await import(String('/src/app/settings.ts'));
    usePrefs.getState().set({ voiceReplies: true, voiceJournal: true });
    useVoice.setState({ status: 'listening', agent: true });
  });
  const turn = page.evaluate(() => (window as unknown as Hear).__flowTower.hear('Spiegami il primo livello.'));
  await expect.poll(() => chat).toBe(2); // the first sentence went to speech, the tool ran, step 2 waits
  expect(speak).toBe(1);
  await page.keyboard.press('Escape');
  release();
  await turn;
  expect(speak).toBe(1); // nothing more of this reply was spoken
  expect((await state(page)).focusedLayer).toBe(0); // Esc silenced the reply instead of leaving the layer
  await expect.poll(() => entries.map((e) => e.outcome)).toEqual(['interrupted']);
});
