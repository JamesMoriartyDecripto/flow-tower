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

/** OpenTelemetry: Claude Code's api_request log lands on the agent node as tokens and cost. */
test('OTLP logs: tokens and cost per node, per tower and per project', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  const t = tower(id);
  const node = t.layers.flatMap((l) => l.nodes).find((n) => n.type === 'agent' && n.agent && !n.match?.length && !n.agent.match?.length)!;
  await openProject(page, id);
  const record = (tokens: [number, number], cost: number) => ({
    body: { stringValue: 'claude_code.api_request' },
    attributes: [
      { key: 'agent.name', value: { stringValue: node.agent!.id } }, { key: 'model', value: { stringValue: 'claude-opus-5-5' } },
      { key: 'input_tokens', value: { intValue: String(tokens[0]) } }, { key: 'output_tokens', value: { intValue: String(tokens[1]) } },
      { key: 'cost_usd', value: { doubleValue: cost } }, { key: 'query_source', value: { stringValue: 'subagent' } },
    ],
  });
  // The server keeps earlier runs' events: assert on what this test adds to the totals.
  type Ev = { kind: string; targets: string[]; tokens?: number; cost_usd?: number };
  const before = (await (await page.request.get('/api/events')).json()) as Ev[];
  const sum = (events: Ev[], hit: (t: string) => boolean) => events.filter((e) => e.kind === 'usage' && e.targets.some(hit))
    .reduce((a, e) => ({ tokens: a.tokens + (e.tokens ?? 0), cost: a.cost + (e.cost_usd ?? 0), calls: a.calls + 1 }), { tokens: 0, cost: 0, calls: 0 });
  const inTower = (t: string) => t.startsWith(id.replace(/\/[^/]+$/, '/'));
  const nodeBase = sum(before, (t) => t === `${id}#${node.key}`);
  const towerBase = sum(before, inTower);
  const fmt = (u: { tokens: number; cost: number }) =>
    `${u.tokens >= 1e3 ? `${(u.tokens / 1e3).toFixed(1)}k` : u.tokens} tokens${u.cost > 0 ? ` · $${u.cost.toFixed(2)}` : ''}`;
  const res = await page.request.post('/v1/logs', {
    data: { resourceLogs: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'claude-code' } }] }, scopeLogs: [{ logRecords: [record([1000, 200], 0.25), record([500, 300], 0.5)] }] }] },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({});
  expect((await page.request.post('/v1/logs', { data: 'x', headers: { 'content-type': 'application/x-protobuf' } })).status()).toBe(415);
  expect((await page.request.post('/v1/metrics', { data: { resourceMetrics: [] } })).status()).toBe(200);

  await page.keyboard.press('f');
  const added = { tokens: 2000, cost: 0.75 };
  await expect(page.locator('.feed-usage')).toHaveText(fmt({ tokens: towerBase.tokens + added.tokens, cost: towerBase.cost + added.cost }));
  await page.evaluate((key) => (window as unknown as { __flowTower: { store: { getState(): { select(k: string): void } } } }).__flowTower.store.getState().select(key), node.key);
  await expect(page.locator('.inspector')).toContainText(`${fmt({ tokens: nodeBase.tokens + added.tokens, cost: nodeBase.cost + added.cost })} · ${nodeBase.calls + 2} model calls`);
  await page.keyboard.press('l');
  await expect(page.locator(`[data-card="${id}"] .lib-usage`)).toContainText(fmt({ tokens: towerBase.tokens + added.tokens, cost: towerBase.cost + added.cost }));
});
