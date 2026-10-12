import { createServer } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { live } from '../examples/model-benchmark/scripts/live.mjs';

// The stub records every event the scripts POST, so the shape can be asserted without a real tower.
const servers: ReturnType<typeof createServer>[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function stub() {
  const got: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { got.push(JSON.parse(body) as Record<string, unknown>); } catch { /* ignore */ }
      res.writeHead(204).end();
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, got };
}

/** Poll until `got` holds `n` events (the POST is fire and forget). Stops at the timeout; the caller asserts the count. */
async function settle(got: unknown[], n = 1): Promise<void> {
  for (let i = 0; i < 100 && got.length < n; i++) await new Promise((r) => setTimeout(r, 20));
}

describe('model-benchmark live() (#105)', () => {
  it('is a no-op with an empty url', { timeout: 5000 }, async () => {
    const emit = live('');
    // No fetch, no throw, and the promise still resolves: a benchmark without a tower is unaffected.
    await expect(emit({ kind: 'log', node: 'runner.key' })).resolves.toBeUndefined();
  });

  it('ignores an undefined url too', { timeout: 5000 }, async () => {
    await expect(live(undefined)({ kind: 'log' })).resolves.toBeUndefined();
  });

  it('posts the tower and source on every event', { timeout: 5000 }, async () => {
    const { url, got } = await stub();
    live(url)({ kind: 'agent.start', node: 'runner.loop', model: 'vendor-a/model-x', session: 'run-1', message: 'coder/parse-edge run 1' });
    await settle(got);
    expect(got).toEqual([{
      tower: 'model-benchmark', source: 'model-benchmark',
      kind: 'agent.start', node: 'runner.loop', model: 'vendor-a/model-x', session: 'run-1', message: 'coder/parse-edge run 1',
      ts: expect.any(Number),
    }]);
  });

  it('never sends a prompt, an answer or a key', { timeout: 5000 }, async () => {
    const { url, got } = await stub();
    const emit = live(url);
    emit({ kind: 'agent.start', node: 'runner.loop', message: 'coder/parse-edge run 1' });
    emit({ kind: 'tool.end', node: 'runner.api', tool: 'chat/completions', status: 'error', message: 'HTTP 429' });
    emit({ kind: 'usage', node: 'measure.cost', tokens: 1200, cost_usd: 0.004 });
    await settle(got, 3);
    expect(got).toHaveLength(3);
    for (const e of got) {
      expect(e).not.toHaveProperty('prompt');
      expect(e).not.toHaveProperty('answer');
      expect(e).not.toHaveProperty('api_key');
      expect(JSON.stringify(e)).not.toContain('sk-');
    }
  });

  it('swallows a missing tower instead of failing the run', { timeout: 5000 }, async () => {
    // 127.0.0.1:1 is closed: the POST must reject internally and still resolve for the caller.
    await expect(live('http://127.0.0.1:1')({ kind: 'log', node: 'runner.key' })).resolves.toBeUndefined();
  });
});
