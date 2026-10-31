import type { ResolvedNode } from '../src/core/types.ts';
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
  await expect(page.locator('.nodelist')).toContainText('Triage');
});

test('voice journal: turns are written, a correction marks the last one, accepted aliases apply first (#68)', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  const journal: { entry?: { ts: number; heard: string; route: string; did: string; outcome: string; node?: string; layer?: string }; mark?: { ts: number; outcome: string } }[] = [];
  const memory = { aliases: [{ heard: 'smistatore', means: 'Triage' }], notes: [], pending: [], reviewedUpTo: 0 };
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

  // "smistatore" names nothing on screen: the accepted alias makes it "Triage" before the parser reads it.
  await hear('vai al nodo smistatore');
  const triage = tower(id).layers.flatMap((l) => l.nodes).find((n) => n.label === 'Triage')!;
  expect((await state(page)).selected).toBe(triage.key);
  await expect(page.locator('.voice-caption')).toContainText('Triage');
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

test('voice: "chiudi il file" closes the viewer and keeps the node selected (#128)', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  // An agent is configured, and the real routing is exercised: a request to /chat would mean the fixed
  // phrase went to the agent instead of the parser, so it is recorded and must stay at zero.
  let chatCalls = 0;
  await page.route(/\/api\/voice(\/|\?|$)/, (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/voice/chat') { chatCalls++; return r.fulfill({ status: 500, json: { error: 'the parser should have handled this' } }); }
    return r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } });
  });
  const node = tower(id).layers.flatMap((l) => l.nodes).find((n) => n.files.length)!;

  await openProject(page, id);
  // Selected and with its first file open in the viewer, as the agent would leave them.
  await page.evaluate((n) => {
    const s = (window as unknown as { __flowTower: { store: { getState(): { select(k: string): void; openFile(f: object): void } } } }).__flowTower.store.getState();
    s.select(n.key);
    s.openFile({ tower: n.tower, files: n.files, index: 0 });
  }, { key: node.key, tower: id, files: node.files });
  await expect.poll(async () => (await state(page)).file).toBe(true);
  // The caption only shows a transcript while the voice is not off: the test says it through the hook below.
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    useVoice.setState({ status: 'listening', agent: true });
  });

  // Through hear(), like a transcript: the routing decides parser or agent, and this phrase is a command.
  await page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), 'chiudi il file');
  await expect(page.locator('.viewer')).toHaveCount(0);
  expect((await state(page)).file).toBe(false);
  expect((await state(page)).selected).toBe(node.key);
  await expect(page.locator('.voice-caption .voice-heard')).toContainText('File closed');

  // Nothing open: the command is harmless, not an error, and it says so.
  await page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), 'chiudi il file');
  await expect(page.locator('.voice-caption .voice-heard')).toContainText('No file open');
  await expect(page.locator('.voice-caption .voice-error')).toHaveCount(0);
  expect(chatCalls).toBe(0);
});

test('voice: "apri il suo file" then "il prossimo" walk the files, then the layer (#130)', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  // An agent is configured and the real routing runs: a request to /chat would mean a fixed phrase went
  // to the agent instead of the parser, so it is recorded and must stay at zero.
  let chatCalls = 0;
  await page.route(/\/api\/voice(\/|\?|$)/, (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/voice/chat') { chatCalls++; return r.fulfill({ status: 500, json: { error: 'the parser should have handled this' } }); }
    return r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } });
  });
  // The first node with at least two files: the one the test walks, first by its label, then by phrases.
  const node = tower(id).layers.flatMap((l) => l.nodes).find((n) => n.files.length >= 2)!;
  const [file1, file2] = node.files;

  await openProject(page, id);
  // "il prossimo" moves in the layout's flow order, published once ELK runs: wait for it, so the
  // expected node computed below and the one the command picks come from the same order.
  await expect.poll(() => page.evaluate(async (t) => !!(await import(String('/src/app/keynav.ts'))).layoutOf(t), id)).toBe(true);
  // The caption only shows a transcript while the voice is not off: the test says it through the hook below.
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    useVoice.setState({ status: 'listening', agent: true });
  });
  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);

  // Its label alone selects the node: the parser matches the names on screen.
  await hear(node.label);
  expect((await state(page)).selected).toBe(node.key);

  // "apri il suo file": the first file of the selected node, in the viewer.
  await hear('apri il suo file');
  await expect(page.locator('.viewer')).toHaveCount(1);
  await expect(page.locator('.viewer-path')).toHaveText(file1);
  expect((await state(page)).file).toBe(true);
  await expect(page.locator('.voice-caption .voice-heard')).toContainText(file1);

  // "file successivo": the second file, the next tab of the same viewer.
  await hear('file successivo');
  await expect(page.locator('.viewer-path')).toHaveText(file2);

  // "chiudi il file": only the viewer closes, the node stays selected.
  await hear('chiudi il file');
  await expect(page.locator('.viewer')).toHaveCount(0);
  expect((await state(page)).file).toBe(false);
  expect((await state(page)).selected).toBe(node.key);
  await expect(page.locator('.voice-caption .voice-heard')).toContainText('File closed');

  // "il prossimo": the next node of the selected node's layer, in the flow order the node list shows.
  const next = await page.evaluate(async (key) => {
    const { flowOrder } = await import(String('/src/app/keynav.ts'));
    const s = (window as unknown as { __flowTower: { store: { getState(): { stack: string[]; workspace?: { towers: Record<string, { id: string; layers: { nodes: { key: string }[] }[] }> } } } } }).__flowTower.store.getState();
    const t = s.workspace!.towers[s.stack[s.stack.length - 1]];
    const li = t.layers.findIndex((l) => l.nodes.some((n) => n.key === key));
    const order = flowOrder(t.id, t.layers[li] as never);
    return order[order.findIndex((n: ResolvedNode) => n.key === key) + 1]?.key;
  }, node.key);
  expect(next, 'the walked node is the last of its layer').toBeTruthy();
  await hear('il prossimo');
  expect((await state(page)).selected).toBe(next);
  expect(chatCalls).toBe(0);
});

test('voice: the new fixed phrases scroll, filter and open the hub, all on the parser (#145)', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  // An agent is configured and the real routing runs: a request to /chat would mean a fixed phrase went
  // to the agent instead of the parser, so it is recorded and must stay at zero (#128, #145).
  let chatCalls = 0;
  await page.route(/\/api\/voice(\/|\?|$)/, (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/voice/chat') { chatCalls++; return r.fulfill({ status: 500, json: { error: 'the parser should have handled this' } }); }
    return r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } });
  });
  // The page is on a hub, so the Hub commands have something to open; the Machines tab is a read route.
  await page.route('**/api/hub/me', (r) => r.fulfill({ json: { hub: true, readOnly: false, online: 1, tokens: 1 } }));
  await page.route('**/api/hub/machines', (r) => r.fulfill({ json: [] }));
  // In hub mode the alert pill polls this route (#94); the test server is not a hub, so it would 404.
  await page.route('**/api/hub/alerts', (r) => r.fulfill({ json: { alerts: [], rules: [], counts: { warning: 0, critical: 0 } } }));
  // A file long enough that the viewer's code pane must overflow, or a page step has nowhere to go.
  const long = 'README.md';
  const node = tower(id).layers.flatMap((l) => l.nodes).find((n) => n.files.includes(long))!;
  const index = node.files.indexOf(long);

  await openProject(page, id);
  // Selected and with its file open in the viewer, as the agent would leave them.
  await page.evaluate((n) => {
    const s = (window as unknown as { __flowTower: { store: { getState(): { select(k: string): void; openFile(f: object): void } } } }).__flowTower.store.getState();
    s.select(n.key);
    s.openFile({ tower: n.tower, files: n.files, index: n.index });
  }, { key: node.key, tower: id, files: node.files, index });
  // The code pane exists only once the file is fetched and highlighted: scroll before that has nothing to move.
  await expect(page.locator('.viewer .code pre')).toBeVisible();
  expect(await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('.viewer .code')!;
    return c.scrollHeight > c.clientHeight;
  }), 'the file overflows the viewer').toBe(true);
  // The caption only shows a transcript while the voice is not off: the test says it through the hook below.
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    useVoice.setState({ status: 'listening', agent: true });
  });
  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);
  const scrollTop = () => page.evaluate(() => document.querySelector<HTMLElement>('.viewer .code')!.scrollTop);
  const hidden = () => page.evaluate(() => [...(window as unknown as { __flowTower: { store: { getState(): { hiddenTypes: Set<string> } } } })
    .__flowTower.store.getState().hiddenTypes].sort());

  // "scorri giù": the viewer's own scrolling element moves down a page step (smooth, hence polled).
  await hear('scorri giù');
  await expect.poll(scrollTop).toBeGreaterThan(0);
  // "vai all'inizio": back to the top.
  await hear("vai all'inizio");
  await expect.poll(scrollTop).toBe(0);
  // "chiudi il file": the viewer closes, the node stays selected.
  await hear('chiudi il file');
  await expect(page.locator('.viewer')).toHaveCount(0);
  expect((await state(page)).file).toBe(false);
  expect((await state(page)).selected).toBe(node.key);

  // "mostra solo gli agenti": every other node type is hidden.
  await hear('mostra solo gli agenti');
  await expect.poll(hidden).toEqual(['decision', 'entry', 'guard', 'hook', 'human', 'memory', 'model', 'output', 'process', 'tool']);
  // "mostra tutto": nothing hidden again.
  await hear('mostra tutto');
  await expect.poll(hidden).toEqual([]);

  // "mostra le macchine": the Hub panel opens on the Machines tab.
  await hear('mostra le macchine');
  await expect(page.locator('.hub')).toBeVisible();
  await expect(page.locator('#hub-tab-machines')).toHaveAttribute('aria-selected', 'true');
  // "chiudi l'hub": the panel closes.
  await hear("chiudi l'hub");
  await expect(page.locator('.hub')).toHaveCount(0);

  expect(chatCalls).toBe(0);
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
    if (path === '/api/voice/speak') {
      // The cached acknowledgement phrases (#70) are warmed too: only the reply's own sentences count.
      if (!/^(Ecco|Riceve|Poi)/.test(r.request().postDataJSON().text)) return r.fulfill({ status: 204 });
      speak++; await held; return r.fulfill({ status: 204 }).catch(() => undefined);
    }
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
