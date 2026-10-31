import { expect, openProject, state, test, tower, ws } from './fixtures.ts';

/**
 * "cosa sta succedendo?" (#160): the agent reads the live events through the live_status tool, so a
 * question about what is happening gets the real error and the node it hit, not a guess. The events are
 * posted for real to /api/events; the test checks the tool result the model would see and the caption.
 */
type Hear = { __flowTower: { hear(text: string): Promise<void> } };
type ChatMessage = { role: string; content?: string };

test('voice: \'cosa sta succedendo?\' reports the error and selects the node (#160)', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  const t = tower(id);
  const node = 'intake.triage';
  let chatCalls = 0;
  let secondBody: { messages: ChatMessage[] } | undefined;
  await page.route('**/api/voice', (r) => r.fulfill({ json: { cloud: true, model: 'stt', agent: 'test-model', tts: 'test-tts', journal: false } }));
  // Call 1 asks for the live status; call 2 records what the model was given and answers from it.
  await page.route('**/api/voice/chat', (r) => {
    chatCalls++;
    const chunks = chatCalls === 1
      ? [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'live_status', arguments: '{}' } }] } }] }]
      : [{ choices: [{ delta: { content: 'C\'è un errore su Triage.' } }], usage: { cost: 0.0001 } }];
    if (chatCalls === 2) secondBody = r.request().postDataJSON();
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

  // Real events, same path a Claude Code hook takes. The message carries a marker that must never
  // reach the model: the tool reports the node and the status, not the raw message text.
  const source = 'e2e-live-status-' + Date.now();
  const post = (body: object) => page.request.post('/api/events', { data: body });
  for (const res of [
    await post({ kind: 'tool.start', source, node, tower: t.id, tool: 'gh', message: 'SECRET-MARKER' }),
    await post({ kind: 'tool.end', source, node, tower: t.id, tool: 'gh', status: 'error', message: 'SECRET-MARKER' }),
  ]) {
    expect(res.status()).toBe(204);
  }
  // Wait for the feed to show the events before asking: the question must see them.
  await page.keyboard.press('f');
  await expect(page.locator('.livefeed')).toBeVisible();
  await page.locator('.livefeed button', { hasText: 'Library' }).click();
  await expect(page.locator('.feed-row').first()).toBeVisible();

  const hear = (text: string) => page.evaluate((t) => (window as unknown as Hear).__flowTower.hear(t), text);
  await hear('cosa sta succedendo?');

  expect(chatCalls).toBe(2);
  const toolMsg = secondBody!.messages.find((m) => m.role === 'tool');
  expect(toolMsg).toBeDefined();
  expect(toolMsg!.content).toContain('Triage');
  expect(toolMsg!.content).toContain('"quiet":false');
  expect(toolMsg!.content).not.toContain('SECRET-MARKER');
  expect((await state(page)).selected).toBe(node);
  await expect(page.locator('.voice-caption .voice-heard')).toContainText('C\'è un errore su Triage.');
});
