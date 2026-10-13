import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelay, type RelayOptions } from '../src/server/relay';
import type { FlowEvent } from '../src/core/events';

const TOKEN = 'ft_test_secret';
const NEW_TOKEN = 'ft_new_secret';

const event = (id: number): FlowEvent => ({
  id, ts: 1000 + id, targets: ['t#a'], kind: 'prompt', source: 'claude-code', message: 'a secret prompt', data: {},
} as unknown as FlowEvent);

/** A fake hub: each call gets the next scripted reply, and the last one repeats. */
function fakeHub(replies: Array<{ status: number; body?: unknown }>) {
  const calls: { path: string; token?: string; body: unknown }[] = [];
  let i = 0;
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({ path: String(url).replace(/^https?:\/\/[^/]+/, ''), token: headers?.['x-flow-tower-token'], body: JSON.parse(String(init?.body ?? 'null')) });
    const reply = replies[Math.min(i++, replies.length - 1)];
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls, eventCalls: () => calls.filter((c) => c.path === '/api/events') };
}

const relayOf = (fetch: typeof globalThis.fetch, over: Partial<RelayOptions> = {}) =>
  createRelay({ url: 'http://hub.test', token: TOKEN, now: () => Date.now(), fetch, recheckMs: 30_000, ...over });

/** Let pending promise callbacks (fetch replies, body reads) run under fake timers. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

describe('satellite relay recovers (#188)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a refused token keeps the queue and resumes online when the recheck gets 200', async () => {
    const hub = fakeHub([{ status: 401, body: { error: 'nope', state: 'refused' } }, { status: 200 }, { status: 200 }]);
    const relay = relayOf(hub.fetch);
    relay.push([event(1), event(2)]);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(relay.state()).toMatchObject({ state: 'revoked', queued: 2, lastError: 'hub refused the token (401)' });

    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(relay.state()).toMatchObject({ state: 'online', queued: 0 });
    expect(relay.state().lastError).toBeUndefined();
    const delivered = hub.eventCalls().at(-1)?.body as Record<string, unknown>[];
    expect(delivered.map((e) => e.kind)).toEqual(['prompt', 'prompt']);
    relay.stop();
  });

  it('a hub pause (401 with state paused) is held, then resumes online on 200', async () => {
    const hub = fakeHub([{ status: 401, body: { error: 'paused', state: 'paused' } }, { status: 200 }, { status: 200 }]);
    const relay = relayOf(hub.fetch);
    relay.push([event(1)]);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(relay.state()).toMatchObject({ state: 'held', queued: 1, lastError: 'the hub paused this machine' });

    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(relay.state()).toMatchObject({ state: 'online', queued: 0 });
    relay.stop();
  });

  it('a 401 with no JSON body is still a plain refusal, never a throw', async () => {
    const hub = fakeHub([{ status: 403 }]);
    const relay = relayOf(hub.fetch);
    await relay.heartbeat();
    expect(relay.state()).toMatchObject({ state: 'revoked', lastError: 'hub refused the token (403)' });
    relay.stop();
  });

  it('setCredentials after a refusal goes online, delivers the queue and sends the new token', async () => {
    const hub = fakeHub([{ status: 401, body: { state: 'refused' } }, { status: 200 }, { status: 200 }]);
    const relay = relayOf(hub.fetch);
    relay.push([event(1), event(2)]);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(relay.state().state).toBe('revoked');

    relay.setCredentials({ url: 'http://other-hub.test/', token: NEW_TOKEN });
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(relay.state()).toMatchObject({ state: 'online', queued: 0, hub: 'http://other-hub.test' });
    const sent = hub.calls.filter((c) => c.path === '/api/events').at(-1);
    expect(sent?.token).toBe(NEW_TOKEN);
    relay.stop();
  });

  it('sendTest while revoked recovers on 200', async () => {
    const hub = fakeHub([{ status: 401, body: { state: 'refused' } }, { status: 200 }]);
    const relay = relayOf(hub.fetch, { paused: false });
    await relay.heartbeat();
    expect(relay.state().state).toBe('revoked');

    const test = relay.sendTest();
    await vi.advanceTimersByTimeAsync(0);
    const result = await test;
    expect(result).toMatchObject({ state: 'online' });
    expect(result.lastError).toBeUndefined();
    relay.stop();
  });

  it('reports each state change once, with the word and the last error but never the token', async () => {
    const hub = fakeHub([{ status: 401, body: { state: 'paused' } }, { status: 401, body: { state: 'paused' } }, { status: 200 }]);
    const changes: [string, string | undefined][] = [];
    const relay = relayOf(hub.fetch, { onStateChange: (s, e) => changes.push([s, e]) });
    await relay.heartbeat();
    // Two rechecks: the first is still paused (no change to report), the second is accepted.
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(changes).toEqual([
      ['held', 'the hub paused this machine'],
      ['online', undefined],
    ]);
    expect(JSON.stringify(changes)).not.toContain(TOKEN);
    relay.stop();
  });

  it('never puts the token in state() or lastError', async () => {
    const hub = fakeHub([{ status: 401, body: { state: 'refused' } }]);
    const relay = relayOf(hub.fetch);
    relay.push([event(1)]);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(JSON.stringify(relay.state())).not.toContain(TOKEN);
    expect(relay.state().lastError ?? '').not.toContain(TOKEN);
    relay.stop();
  });
});
