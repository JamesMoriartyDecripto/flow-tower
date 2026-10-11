import { createServer, type Server } from 'node:http';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRelay, type RelayOptions } from '../src/server/relay';
import { targetsSelf } from '../src/server/plugin';
import type { ViteDevServer } from 'vite';
import { stopOnClose } from '../src/server/lifecycle';
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
  const seen: { path?: string; body: unknown; headers: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')), headers: req.headers });
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

  it('sends only the allow-listed metadata, dropping role and any unknown field', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 200);
    const relay = relayOf(hub.url);
    // Every allowed field is present, plus content and a field no adapter should be able to leak.
    relay.push([event({
      kind: 'tool.start', ts: 42, source: 'custom', session: 's1', agent: 'main', parent: 'p1',
      tool: 'Bash', call: 'c1', model: 'gpt', node: 'n1', project: 'prj', user: 'dana', host: 'laptop',
      runtime: 'node', status: 'ok', tokens: 12, cost_usd: 0.5, duration_ms: 7, estimated: true,
      role: 'Task: cat /etc/passwd', prompt: 'secret prompt', secret_path: '/home/me/.ssh/id_rsa',
    } as unknown as Partial<FlowEvent>)]);
    await relay.flush();

    const [wire] = hub.seen[0].body as Record<string, unknown>[];
    expect(wire).toEqual({
      kind: 'tool.start', ts: 42, source: 'custom', session: 's1', agent: 'main', parent: 'p1',
      tool: 'Bash', call: 'c1', model: 'gpt', node: 'n1', project: 'prj', user: 'dana', host: 'laptop',
      runtime: 'node', status: 'ok', tokens: 12, cost_usd: 0.5, duration_ms: 7, estimated: true,
      event_id: 'req-9',
    });
    // Content and anything outside the allow-list is gone, whatever its name.
    for (const dropped of ['id', 'targets', 'runtimeRef', 'sender', 'message', 'data', 'role', 'prompt', 'secret_path']) {
      expect(wire).not.toHaveProperty(dropped);
    }
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

  it('stays online while events wait for the next flush, and only queues while backing off', { timeout: 5_000 }, async () => {
    // The event endpoint's status changes mid-test; the heartbeat (start-up) always answers 204.
    let status = 204;
    const server = createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        res.statusCode = req.url === '/api/events' ? status : 204;
        res.end('{}');
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const relay = relayOf(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);

    relay.push([event()]);
    // Events merely waiting for the next flush are not "queued": a healthy relay is online.
    expect(relay.state()).toMatchObject({ state: 'online', queued: 1 });

    status = 503;
    await relay.flush();
    expect(relay.state()).toMatchObject({ state: 'queued', queued: 1 });

    status = 204;
    await relay.flush();
    expect(relay.state()).toMatchObject({ state: 'online', queued: 0 });
    relay.stop();
  });

  it('stops sending on 401 and reports revoked', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 401);
    const relay = relayOf(hub.url);
    relay.push([event()]);
    await relay.flush();
    expect(relay.state().state).toBe('revoked');

    await relay.flush();
    // No further event batch once revoked (the start-up heartbeat is a separate request).
    expect(hub.seen.filter((r) => r.path === '/api/events')).toHaveLength(1);
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

  it('posts a heartbeat with its state and version, and beats once at start', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 204);
    const relay = relayOf(hub.url, { version: '0.5.0' });
    // The first beat is scheduled at 0 ms: give the timer a tick to run before flushing anything.
    await new Promise((r) => setTimeout(r, 20));
    expect(hub.seen.length).toBeGreaterThanOrEqual(1);
    const beat = hub.seen[0];
    expect(beat.headers['x-flow-tower-token']).toBe('ft_test_secret');
    expect(beat.body).toMatchObject({ queued: 0, dropped: 0, state: 'online', version: '0.5.0' });
    relay.stop();
  });

  it('marks itself revoked when the hub refuses the heartbeat, and never throws', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 401);
    const relay = relayOf(hub.url);
    await relay.heartbeat();
    expect(relay.state().state).toBe('revoked');
    relay.stop();
  });

  it('pauses: sends nothing, beats nothing, and does not queue what arrives', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 204);
    const relay = relayOf(hub.url, { paused: true });
    // The start-up beat is scheduled at 0 ms: while paused it must never run.
    await new Promise((r) => setTimeout(r, 20));
    relay.push([event()]);
    await relay.flush();
    await relay.heartbeat();

    expect(hub.seen).toHaveLength(0);
    // Paused is not "queued either": nothing piles up to leave later.
    expect(relay.state()).toMatchObject({ state: 'paused', queued: 0 });
    // No send after the settle window either (an unref'd timer must not have fired).
    await new Promise((r) => setTimeout(r, 20));
    expect(hub.seen).toHaveLength(0);
    relay.stop();
  });

  it('resumes: the heartbeat and the events flow again', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 204);
    const relay = relayOf(hub.url, { paused: true });
    relay.push([event()]);
    // Events pushed while paused are gone by design: nothing may pile up to leave later.
    relay.resume();
    relay.push([event()]);
    await relay.flush();

    expect(relay.state().state).toBe('online');
    const events = hub.seen.filter((r) => r.path === '/api/events');
    expect(events).toHaveLength(1);
    expect((events[0].body as unknown[]).length).toBe(1);
    relay.stop();
  });

  it('sends one minimal test event and reports what left the machine', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 204);
    const relay = relayOf(hub.url);
    const state = await relay.sendTest();

    const sent = hub.seen.find((r) => r.path === '/api/events');
    expect(sent).toBeDefined();
    const [wire] = sent!.body as Record<string, unknown>[];
    expect(wire).toMatchObject({ kind: 'log', source: 'flow-tower', status: 'ok' });
    for (const omitted of ['message', 'data', 'node', 'tool', 'id', 'targets']) expect(wire).not.toHaveProperty(omitted);
    // Exactly what left the machine, and never the token.
    expect(state.lastPayload).toMatchObject({ kind: 'log', source: 'flow-tower' });
    expect(JSON.stringify(state)).not.toContain('ft_test_secret');
    relay.stop();
  });

  it('reports the last payload actually sent, stripped of content', { timeout: 5_000 }, async () => {
    const hub = await stubHub(() => 200);
    const relay = relayOf(hub.url);
    expect(relay.state().lastPayload).toBeUndefined();
    relay.push([event()]);
    await relay.flush();
    // The prompt and its data are gone; the request id survives as event_id.
    expect(relay.state().lastPayload).toMatchObject({ kind: 'prompt', event_id: 'req-9' });
    expect(relay.state().lastPayload).not.toHaveProperty('message');
    expect(relay.state().lastPayload).not.toHaveProperty('data');
    relay.stop();
  });
});

describe('self-loop guard for the satellite relay (#91)', () => {
  // The dev server bound to this port; only the address() shape targetsSelf touches matters here.
  const server = { httpServer: { address: () => ({ port: 5317 }) } } as unknown as ViteDevServer;
  const self = (url: string) => targetsSelf(url, server);

  it('refuses localhost, bracketed IPv6 and 127.x on the same port', () => {
    expect(self('http://localhost:5317')).toBe(true);
    expect(self('http://[::1]:5317')).toBe(true);
    expect(self('http://127.0.0.2:5317')).toBe(true);
  });

  it('allows the same loopback hosts on another port, and a remote host', () => {
    expect(self('http://localhost:5318')).toBe(false);
    expect(self('http://[::1]:5318')).toBe(false);
    expect(self('http://127.0.0.2:5318')).toBe(false);
    expect(self('http://hub.example:5317')).toBe(false);
  });
});

describe('dev server close stops the relay (#91, #99)', () => {
  // Vite restarts the server when a src/server file or the config changes and closes the old http server.
  // Without wiring close -> stop, the old relay kept beating at the hub and its unref'd timers kept the
  // previous server alive, so memory grew across restarts (#99). A plain EventEmitter stands in for the
  // httpServer, since only its 'close' event and once() matter here.
  it('calls every cleanup once when the server closes', () => {
    const server = { httpServer: new EventEmitter() };
    const stopped = vi.fn();
    stopOnClose(server, [stopped]);

    server.httpServer.emit('close');
    expect(stopped).toHaveBeenCalledTimes(1);
    // once(): a second close must not run the cleanups again.
    server.httpServer.emit('close');
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when there is no http server yet, and a throwing cleanup cannot stop the others', () => {
    expect(() => stopOnClose({ httpServer: undefined }, [vi.fn()])).not.toThrow();

    const server = { httpServer: new EventEmitter() };
    const after = vi.fn();
    stopOnClose(server, [() => { throw new Error('boom'); }, after]);
    server.httpServer.emit('close');
    expect(after).toHaveBeenCalledTimes(1);
  });
});
