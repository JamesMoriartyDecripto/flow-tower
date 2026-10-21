import { expect, openProject, state, test, tower, ws } from './fixtures.ts';

/**
 * The guided tour (#275) without a microphone or a key: "panoramica guidata" starts it, the narration model is
 * answered by route interception (nothing is billed), and the test checks what the user sees: the layer on
 * screen, the caption and the controls that move through the tour.
 */
type Hear = { __flowTower: { hear(text: string): Promise<void> } };

/** The narrator's user message carries the layer brief as one JSON line: "Layer: {...}" (see narrate.ts). */
const briefOf = (body: { messages: { role: string; content: string }[] }) => {
  const user = body.messages.find((m) => m.role === 'user')!.content;
  const line = user.split('\n').find((l) => l.startsWith('Layer: '))!;
  return JSON.parse(line.slice('Layer: '.length)) as { nodes: { key: string }[] };
};

test('voice tour: "panoramica guidata" walks the layers with captions, and avanti / indietro / stop move it', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  let chatCalls = 0;
  await page.route('**/api/voice', (r) => r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } }));
  // Every narration is answered with one sentence per node of the brief: the narrator is not streamed.
  await page.route('**/api/voice/chat', (r) => {
    chatCalls++;
    const brief = briefOf(r.request().postDataJSON());
    const lines = brief.nodes.map((n) => ({ node: n.key, sentence: 'Ok.' }));
    return r.fulfill({ json: { message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'narrate_layer', arguments: JSON.stringify({ intro: 'Intro.', lines }) } }] }, ms: 1, cost: 0 } });
  });

  await openProject(page, id);
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    const { usePrefs } = await import(String('/src/app/settings.ts'));
    usePrefs.getState().set({ voiceReplies: false }); // no audio element in a headless test
    useVoice.setState({ status: 'listening', agent: true });
  });
  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);
  const hovered = () => page.evaluate(() => (window as unknown as { __flowTower: { store: { getState(): { hovered?: string } } } }).__flowTower.store.getState().hovered);
  const layer1 = new Set(tower(id).layers[0].nodes.map((n) => n.key));

  await hear('panoramica guidata');
  // The tour is a narration, not an agent turn: no streamed reply, and the first layer is on screen.
  expect((await state(page)).focusedLayer).toBe(0);
  await expect(page.locator('.voice-caption')).toContainText('Layer 1 of');
  // The node being narrated is lit: a key of layer 1 is hovered while its sentence is shown.
  await expect.poll(async () => layer1.has((await hovered()) ?? '')).toBe(true);
  // Layer 2 is asked for while layer 1 is shown (prefetch), so two narrations have been requested by now.
  await expect.poll(() => chatCalls).toBeGreaterThanOrEqual(2);

  await hear('avanti');
  await expect.poll(async () => (await state(page)).focusedLayer).toBe(1);
  await hear('indietro');
  await expect.poll(async () => (await state(page)).focusedLayer).toBe(0);

  // stop ends the tour: the caption says so, and nothing restarts it.
  await hear('stop');
  await expect(page.locator('.voice-caption')).toContainText('Tour stopped');
  const callsAfterStop = chatCalls;
  // Outside a tour "avanti" is the plain step command: it must not start the tour again.
  await hear('avanti');
  await page.waitForTimeout(2500); // long enough for a restarted tour to show its first caption
  await expect(page.locator('.voice-caption')).not.toContainText('Layer 1 of');
  expect(chatCalls).toBe(callsAfterStop);
});

test('voice tour: "livello 3" during a tour ends it and leaves layer 3 focused', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  await page.route('**/api/voice', (r) => r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } }));
  await page.route('**/api/voice/chat', (r) => {
    const brief = briefOf(r.request().postDataJSON());
    const lines = brief.nodes.map((n) => ({ node: n.key, sentence: 'Ok.' }));
    return r.fulfill({ json: { message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'narrate_layer', arguments: JSON.stringify({ intro: 'Intro.', lines }) } }] }, ms: 1, cost: 0 } });
  });

  await openProject(page, id);
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    const { usePrefs } = await import(String('/src/app/settings.ts'));
    usePrefs.getState().set({ voiceReplies: false });
    useVoice.setState({ status: 'listening', agent: true });
  });
  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);

  await hear('panoramica guidata');
  await expect(page.locator('.voice-caption')).toContainText('Layer 1 of');
  // A layer command is not a tour control: it stops the tour and focuses the layer it names.
  await hear('livello 3');
  await expect.poll(async () => (await state(page)).focusedLayer).toBe(2);
  // The stopped tour must not move the view again: layer 3 stays focused.
  await page.waitForTimeout(2500);
  expect((await state(page)).focusedLayer).toBe(2);
});

test('voice tour: Esc stops the tour, and the focused layer does not change afterwards', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  await page.route('**/api/voice', (r) => r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } }));
  await page.route('**/api/voice/chat', (r) => {
    const brief = briefOf(r.request().postDataJSON());
    const lines = brief.nodes.map((n) => ({ node: n.key, sentence: 'Ok.' }));
    return r.fulfill({ json: { message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'narrate_layer', arguments: JSON.stringify({ intro: 'Intro.', lines }) } }] }, ms: 1, cost: 0 } });
  });

  await openProject(page, id);
  await page.evaluate(async () => {
    const { useVoice } = await import(String('/src/app/voice/voice.ts'));
    const { usePrefs } = await import(String('/src/app/settings.ts'));
    usePrefs.getState().set({ voiceReplies: false });
    useVoice.setState({ status: 'listening', agent: true });
  });
  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);

  await hear('panoramica guidata');
  await expect(page.locator('.voice-caption')).toContainText('Layer 1 of');
  await page.keyboard.press('Escape');
  await expect(page.locator('.voice-caption')).toContainText('Tour stopped');
  const focused = (await state(page)).focusedLayer;
  // The tour is over: no later narration step moves the layer on its own.
  await page.waitForTimeout(2500);
  expect((await state(page)).focusedLayer).toBe(focused);
});
