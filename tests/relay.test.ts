import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createRelay, type RelayOptions } from '../src/server/relay';
import type { FlowEvent } from '../src/core/events';

/** One accepted event as ingest hands it to the relay: server-owned fields and content still attached. */
const event = (over: Partial<FlowEvent> = {}): FlowEvent => ({
  id: 1, ts: 1000, targets: ['t#a'], kind: 'prompt', source: 'claude-code',
  message: 'a secret prompt', data: { request_id: 'req-9', tool_output: 'secret' }, ...over,
});

const servers: Server[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); });

/** A stub hub capturing every request body; `reply` decides each status. */
async function stubHub(reply: (n: number) => number) {
  const seen: { body: unknown; headers: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')), headers: req.headers });
      res.statusCode = reply(seen.length);
      res.end('{}');
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, server };
}

const relayOf = (url: string, over: Partial<RelayOptions> = {}) =>
  createRelay({ url, token: 'ft_test_secret', now: () => 1_000_000, ...over });

describe('satellite relay (#91)', () => {
  it('forwards metadata only, keeps the request id and sends the token', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 200);
    const relay = relayOf(hub.url);
    relay.push([event()]);
    await relay.flush();

    const sent = hub.seen[0];
    expect(sent.headers['x-flow-tower-token']).toBe('ft_test_secret');
    const [wire] = sent.body as Record<string, unknown>[];
    for (const dropped of ['id', 'targets', 'runtimeRef', 'sender', 'message', 'data']) expect(wire).not.toHaveProperty(dropped);
    expect(wire.kind).toBe('prompt');
    expect(wire.event_id).toBe('req-9');
    expect(relay.state().queued).toBe(0);
    relay.stop();
  });

  it('fills user and host from the config when the event has none', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 200);
    const relay = relayOf(hub.url, { user: 'dana', machine: 'laptop' });
    relay.push([event(), event({ user: 'alice', host: 'server' })]);
    await relay.flush();

    const bodies = hub.seen[0].body as Record<string, unknown>[];
    expect(bodies[0]).toMatchObject({ user: 'dana', host: 'laptop' });
    expect(bodies[1]).toMatchObject({ user: 'alice', host: 'server' });
    relay.stop();
  });

  it('queues while the hub is down and drains when it answers again', { timeout: 5_000 }, async () => {
    const hub = await stubHub((n) => (n === 1 ? 503 : 200));
    const relay = relayOf(hub.url);
    relay.push([event()]);
    await relay.flush();
    expect(relay.state().state).toBe('queued');
    expect(relay.state().lastError).toContain('503');

    await relay.flush();
    expect(relay.state().queued).toBe(0);
    expect(relay.state().state).toBe('online');
    relay.stop();
  });

  it('stops sending on 401 and reports revoked', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 401);
    const relay = relayOf(hub.url);
    relay.push([event()]);
    await relay.flush();
    expect(relay.state().state).toBe('revoked');

    await relay.flush();
    expect(hub.seen.length).toBe(1); // no further request once revoked
    expect(relay.state().queued).toBe(1); // the event is kept, not lost
    relay.stop();
  });

  it('drops the oldest events when the queue is full and counts them', async () => {
    const relay = relayOf('http://127.0.0.1:1', { maxQueue: 3 });
    relay.push([1, 2, 3, 4, 5, 6].map((n) => event({ id: n, message: `m${n}` })));
    expect(relay.state()).toMatchObject({ queued: 3, dropped: 3 });
    relay.stop();
  });

  it('never exposes the token in its state', async () => {
    const relay = relayOf('http://127.0.0.1:1');
    relay.push([event()]);
    expect(JSON.stringify(relay.state())).not.toContain('ft_test_secret');
    relay.stop();
  });
});
