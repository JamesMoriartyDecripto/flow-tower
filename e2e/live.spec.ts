import { emit, expect, openProject, state, test, tower, ws } from './fixtures.ts';

/** Live events: a mapped event lands on its node, an unmatched one is flagged, clicking a row selects the node. */
test('live feed: mapped, error and unmapped events', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('sre-incident/'))!;
  const t = tower(id);
  const node = t.layers[1].nodes.find((n) => n.type === 'agent') ?? t.layers[1].nodes[0];
  await emit('live.events', 'tool.start', t.name);
  await openProject(page, id);
  await page.keyboard.press('f');
  await expect(page.locator('.livefeed')).toBeVisible();
  await page.locator('.livefeed button', { hasText: 'Clear' }).click();

  const post = (body: object) => page.request.post('/api/events', { data: body });
  const tag = `e2e-${Date.now()}`;
  for (const res of [
    await post({ kind: 'tool.start', source: tag, node: node.key, tower: t.id, message: 'mapped start', call: tag }),
    await post({ kind: 'tool.end', source: tag, node: node.key, tower: t.id, status: 'error', message: 'mapped error', call: tag }),
    await post({ kind: 'tool.start', source: tag, agent: 'nobody-matches-this', message: 'unmapped' }),
  ]) {
    // Claude Code hooks read a JSON body as a decision: the endpoint must stay 204 with no body.
    expect(res.status()).toBe(204);
    expect(await res.text()).toBe('');
  }

  await page.locator('.livefeed button', { hasText: 'Library' }).click();
  await expect(page.locator('.feed-row')).not.toHaveCount(0);
  await expect(page.locator('.feed-row.unmapped').first()).toBeVisible();
  await expect(page.locator('.livefeed .err-count')).toBeVisible();

  await page.locator('.feed-row:not(.unmapped)', { hasText: 'mapped error' }).first().click();
  await expect.poll(async () => (await state(page)).selected).toBe(node.key);
  await emit('live.events', 'tool.end', 'feed ok', 'ok');
});

test('events endpoint rejects malformed bodies without crashing', async ({ request }) => {
  for (const data of ['{not json', '[]', '{"kind":42}', JSON.stringify({ kind: 'log', message: 'x'.repeat(200_000) })]) {
    const res = await request.post('/api/events', { data, headers: { 'content-type': 'application/json' } });
    expect(res.status(), `body ${data.slice(0, 20)}`).toBeLessThan(500);
  }
  // Every event is matched against every node: an oversized batch is refused instead of stalling the server.
  const flood = Array.from({ length: 1001 }, () => ({ kind: 'log', message: 'x' }));
  expect((await request.post('/api/events', { data: flood })).status()).toBe(413);
  expect((await request.get('/api/workspace')).status()).toBe(200);
});
