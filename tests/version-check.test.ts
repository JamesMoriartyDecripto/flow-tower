import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { versionCheckHandler } from '../src/server/version-check';
import { checkForUpdate, type UpdateInfo } from '../src/server/update';

/**
 * Forced update check (#141). The handler is driven with a fake req/res — no server, no network — and the
 * check/clock are injected, so the throttle window and the guards are exercised deterministically.
 */

interface FakeRes { statusCode: number; body: unknown; headers: Record<string, string> }

const call = async (
  handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void> | void,
  { method = 'POST', headers = {} }: { method?: string; headers?: Record<string, string> } = {},
) => {
  const res: FakeRes & Record<string, unknown> = { statusCode: 0, body: undefined, headers: {} };
  // A single object backs both views: the handler writes statusCode on the real res the same way.
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.end = (b?: string) => { res.body = b === undefined ? undefined : JSON.parse(b); };
  // A local socket with no proxy headers: isRemote() only counts in hub mode, which the tests set explicitly.
  const req = { method, url: '/', headers, socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage;
  await handler(req, res as unknown as ServerResponse, () => { throw new Error('next() must not be called'); });
  return res as { statusCode: number; body: Record<string, unknown>; headers: Record<string, string> };
};

const cacheFile = () => join(mkdtempSync(join(tmpdir(), 'flow-tower-vcheck-')), 'update-check.json');
const release = (tag: string, url = 'https://github.com/x/releases/tag/v') =>
  (async () => new Response(JSON.stringify({ tag_name: tag, html_url: url }), { status: 200 })) as unknown as typeof fetch;

describe('forced update check (#141)', () => {
  it('bypasses a fresh cache, asks GitHub and writes the cache', async () => {
    const file = cacheFile();
    // A cache written "just now": a quiet check would reuse it, a forced one must not.
    writeFileSync(file, JSON.stringify({ checkedAt: 10_000, latest: 'v0.1.0', url: 'https://github.com/x/releases/tag/v0.1.0' }));
    let calls = 0;
    const counting = (async (...a: Parameters<typeof fetch>) => { calls++; return release('v0.9.0')(...a); }) as typeof fetch;

    let published: UpdateInfo | undefined;
    const handler = versionCheckHandler({
      current: '0.1.0', hub: false, disabled: false, now: () => 10_000,
      check: (args) => checkForUpdate({ ...args, cacheFile: file, fetchImpl: counting, now: 10_000 }),
      set: (u) => { published = u; },
    });

    const r = await call(handler);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ current: '0.1.0', latest: 'v0.9.0', newer: true, checkedAt: 10_000 });
    expect(r.body).not.toHaveProperty('disabled');
    expect(calls).toBe(1);
    expect(published).toMatchObject({ latest: 'v0.9.0' });
    expect(JSON.parse(readFileSync(file, 'utf8')).latest).toBe('v0.9.0');
  });

  it('throttles a second POST within 60 s and makes no new call', async () => {
    let calls = 0;
    let clock = 1_000;
    const handler = versionCheckHandler({
      current: '0.1.0', hub: false, disabled: false, now: () => clock,
      check: async () => { calls++; return { current: '0.1.0', latest: 'v0.2.0', newer: true } as UpdateInfo; },
      set: () => {},
    });

    const first = await call(handler);
    expect(first.body).not.toHaveProperty('throttled');

    clock = 1_000 + 30_000; // still inside the window
    const second = await call(handler);
    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ latest: 'v0.2.0', throttled: true });
    expect(calls).toBe(1);

    clock = 1_000 + 61_000; // past it: a real check runs again
    await call(handler);
    expect(calls).toBe(2);
  });

  it('refuses a remote request with 403 and makes no call', async () => {
    let calls = 0;
    const handler = versionCheckHandler({
      current: '0.1.0', hub: true, disabled: false, now: () => 1_000,
      check: async () => { calls++; return { current: '0.1.0', newer: false }; },
      set: () => {},
    });

    // Hub mode: any proxy header marks the request as remote.
    const r = await call(handler, { headers: { 'x-forwarded-for': '100.64.0.9' } });
    expect(r.statusCode).toBe(403);
    expect(calls).toBe(0);

    // A cross-site request is refused too, before hub mode even matters.
    const cross = await call(handler, { headers: { 'sec-fetch-site': 'cross-site' } });
    expect(cross.statusCode).toBe(403);
    expect(calls).toBe(0);
  });

  it('answers 405 to a method other than POST', async () => {
    const handler = versionCheckHandler({
      current: '0.1.0', hub: false, disabled: false, now: () => 1_000,
      check: async () => ({ current: '0.1.0', newer: false }),
      set: () => {},
    });
    expect((await call(handler, { method: 'GET' })).statusCode).toBe(405);
  });

  it('answers { disabled: true } and makes no call when the check is off', async () => {
    let calls = 0;
    const handler = versionCheckHandler({
      current: '0.1.0', hub: false, disabled: true, now: () => 1_000,
      check: async () => { calls++; return { current: '0.1.0', newer: false }; },
      set: () => {},
    });
    const r = await call(handler);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ current: '0.1.0', newer: false, disabled: true });
    expect(calls).toBe(0);
  });

  it('reports offline on a failed forced check and keeps the cached latest', async () => {
    const file = cacheFile();
    writeFileSync(file, JSON.stringify({ checkedAt: 1_000, latest: 'v0.3.0', url: 'https://github.com/x/releases/tag/v0.3.0' }));
    const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;

    const handler = versionCheckHandler({
      current: '0.1.0', hub: false, disabled: false, now: () => 1_000_000,
      check: (args) => checkForUpdate({ ...args, cacheFile: file, fetchImpl: failing, now: 1_000_000 }),
      set: () => {},
    });

    const r = await call(handler);
    expect(r.statusCode).toBe(200);
    // The stale-but-still-useful latest survives, so the chip can keep its link; the error says why.
    expect(r.body).toMatchObject({ latest: 'v0.3.0', newer: true, error: 'offline' });
  });
});
