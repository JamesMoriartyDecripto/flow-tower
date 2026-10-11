import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { createBucket, createDedupe, eventIdOf, inTimeWindow, TS_WINDOW_MS } from '../src/server/limits';
import { createEventHub } from '../src/server/events';
import { tokenStore } from '../src/server/tokens';

const servers: ReturnType<typeof createServer>[] = [];
afterAll(() => servers.forEach((s) => s.close()));

/** A controllable clock: limits.ts takes `now` so abuse limits can be tested without waiting. */
function clock(start = 1_700_000_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => { at += ms; } };
}

describe('rate limiting: per-sender token bucket (#83 phase 3)', () => {
  it('empties under a burst and refills at the configured rate', () => {
    const c = clock();
    const bucket = createBucket({ rate: 10, burst: 5, now: c.now });
    for (let i = 0; i < 5; i++) expect(bucket.take('alice')).toBe(true);
    expect(bucket.take('alice')).toBe(false); // burst spent
    c.advance(100); // 0.1 s * 10/s = 1 token
    expect(bucket.take('alice')).toBe(true);
    expect(bucket.take('alice')).toBe(false);
    c.advance(10_000); // never refills past the burst
    for (let i = 0; i < 5; i++) expect(bucket.take('alice')).toBe(true);
    expect(bucket.take('alice')).toBe(false);
  });

  it('keeps a bucket per sender and caps the wait in Retry-After', () => {
    const c = clock();
    const bucket = createBucket({ rate: 10, burst: 1, now: c.now });
    expect(bucket.take('alice')).toBe(true);
    expect(bucket.take('alice')).toBe(false);
    expect(bucket.take('bob')).toBe(true); // a flood from one sender never silences another
    expect(bucket.retryAfter('alice')).toBe(1); // ceil(1/10 * 10) = 1 s
    expect(bucket.retryAfter('bob')).toBe(1);
  });
});

describe('dedupe: LRU of event ids (#83 phase 3)', () => {
  it('reports a key once and evicts the oldest past the cap', () => {
    const dedupe = createDedupe(2);
    expect(dedupe.seen('a')).toBe(false);
    expect(dedupe.seen('a')).toBe(true);
    expect(dedupe.seen('b')).toBe(false);
    expect(dedupe.seen('a')).toBe(true); // refreshed: still resident
    expect(dedupe.seen('c')).toBe(false); // evicts 'b', the least recently used
    expect(dedupe.seen('c')).toBe(true);
    expect(dedupe.seen('b')).toBe(false);
  });

  it('reads the id from the payload in the documented order', () => {
    expect(eventIdOf({ data: { request_id: 'r1' }, call: 'c1' })).toBe('r1');
    expect(eventIdOf({ data: { call: 'c1' }, call: 'c2' })).toBe('c1');
    expect(eventIdOf({ call: 'c2' })).toBe('c2');
    expect(eventIdOf({ event_id: 42 })).toBe('42');
    expect(eventIdOf({ kind: 'log' })).toBeUndefined(); // no id: cannot be deduped
  });
});

describe('timestamp window (#83 phase 3)', () => {
  it('accepts what is close to now and refuses what is far away', () => {
    const at = 1_700_000_000_000;
    expect(inTimeWindow(at, at)).toBe(true);
    expect(inTimeWindow(at - TS_WINDOW_MS, at)).toBe(true);
    expect(inTimeWindow(at - TS_WINDOW_MS - 1, at)).toBe(false);
    expect(inTimeWindow(at + TS_WINDOW_MS + 1, at)).toBe(false);
    expect(inTimeWindow(undefined, at)).toBe(true); // filled in as now by ingest
  });
});

describe('ingest abuse limits (#83 phase 3)', () => {
  it('answers 429 with Retry-After once a sender has spent its burst, then lets it back in', async () => {
    const c = clock();
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-limits-'));
    const { token } = tokenStore(home).create('dana');
    const hub = createEventHub(() => undefined, () => undefined, { home }, {
      bucket: createBucket({ rate: 20, burst: 2, now: c.now }),
      clock: c.now,
    });
    const server = createServer((rq, rs) => hub.handle(rq, rs));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/events`;
    const post = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-flow-tower-token': token }, body: JSON.stringify({ kind: 'log' }) });

    expect((await post()).status).toBe(204);
    expect((await post()).status).toBe(204);
    const refused = await post();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(hub.recent()).toHaveLength(2);

    c.advance(1000); // 20 tokens/s: a second is plenty
    expect((await post()).status).toBe(204);
    expect(hub.recent()).toHaveLength(3);
  });

  it('lets a legitimate MAX_BATCH batch through the default bucket', async () => {
    // The default burst must exceed MAX_BATCH: a full batch spends 1000 tokens at once (#83).
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-limits-batch-'));
    const { token } = tokenStore(home).create('dana');
    const hub = createEventHub(() => undefined, () => undefined, { home, hub: true });
    const server = createServer((rq, rs) => hub.handle(rq, rs));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/events`;
    const batch = Array.from({ length: 1000 }, (_, i) => ({ kind: 'log', message: `m${i}` }));
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-flow-tower-token': token }, body: JSON.stringify(batch) });
    expect(r.status).toBe(204);
    expect(hub.recent()).toHaveLength(1000);
  });

  it('drops duplicate event ids and out-of-window timestamps without changing the answer', () => {
    const c = clock();
    const hub = createEventHub(() => undefined, () => undefined, { home: mkdtempSync(join(tmpdir(), 'flow-tower-limits-')) }, {
      bucket: createBucket({ now: c.now }),
      clock: c.now,
    });
    expect(hub.ingest({ kind: 'tool.end', call: 'call_1' }, undefined, undefined, 'dana')).toEqual({ accepted: 1, rejected: 0 });
    // A retrying hook re-sends the same tool call: dropped, not counted twice.
    expect(hub.ingest({ kind: 'tool.end', call: 'call_1' }, undefined, undefined, 'dana')).toEqual({ accepted: 0, rejected: 1 });
    // The same call id from another sender is a different event.
    expect(hub.ingest({ kind: 'tool.end', call: 'call_1' }, undefined, undefined, 'erin')).toEqual({ accepted: 1, rejected: 0 });

    expect(hub.ingest({ kind: 'log', ts: c.now() - TS_WINDOW_MS - 1 })).toEqual({ accepted: 0, rejected: 1 });
    expect(hub.ingest({ kind: 'log', ts: c.now() + TS_WINDOW_MS + 1 })).toEqual({ accepted: 0, rejected: 1 });
    expect(hub.ingest({ kind: 'log', ts: c.now() })).toEqual({ accepted: 1, rejected: 0 });
    expect(hub.recent()).toHaveLength(3);
    expect(hub.recent().every((e) => typeof e.ts === 'number')).toBe(true);
  });

  it('does not rate limit a local unauthenticated hook (no token configured)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-limits-open-'));
    const hub = createEventHub(() => undefined, () => undefined, { home }, { bucket: createBucket({ burst: 1 }) });
    const server = createServer((rq, rs) => hub.handle(rq, rs));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/events`;
    for (let i = 0; i < 3; i++) {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'log' }) });
      expect(r.status).toBe(204);
    }
    expect(hub.recent()).toHaveLength(3);
  });
});
