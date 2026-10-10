import { expect, openProject, state, test, ws } from './fixtures.ts';

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
