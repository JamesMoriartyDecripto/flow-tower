import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkForUpdate, isNewer, updateCheckDisabled } from '../src/server/update';

const cacheFile = () => join(mkdtempSync(join(tmpdir(), 'flow-tower-update-')), 'update-check.json');
const release = (tag: unknown, url: unknown = 'https://github.com/x/releases/tag/v') =>
  (async () => new Response(JSON.stringify({ tag_name: tag, html_url: url }), { status: 200 })) as unknown as typeof fetch;
const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;

describe('update notice', () => {
  it('compares versions numerically, ignoring the v prefix', () => {
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('v0.0.9', '0.1.0')).toBe(false);
    expect(isNewer('nightly', '0.1.0')).toBe(false);
    expect(isNewer('v0.2.0-rc.1', '0.1.0')).toBe(false);
  });

  it('reports a newer release, and nothing for the same or an older one', async () => {
    expect(await checkForUpdate({ current: '0.1.0', cacheFile: cacheFile(), fetchImpl: release('v0.2.0') }))
      .toMatchObject({ newer: true, latest: 'v0.2.0' });
    expect((await checkForUpdate({ current: '0.1.0', cacheFile: cacheFile(), fetchImpl: release('v0.1.0') })).newer).toBe(false);
    expect((await checkForUpdate({ current: '0.2.0', cacheFile: cacheFile(), fetchImpl: release('v0.1.0') })).newer).toBe(false);
  });

  it('stays silent on malformed answers, HTTP errors and network failures', async () => {
    expect(await checkForUpdate({ current: '0.1.0', cacheFile: cacheFile(), fetchImpl: release(42) })).toEqual({ current: '0.1.0', newer: false });
    const limited = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    expect(await checkForUpdate({ current: '0.1.0', cacheFile: cacheFile(), fetchImpl: limited })).toEqual({ current: '0.1.0', newer: false });
    expect(await checkForUpdate({ current: '0.1.0', cacheFile: cacheFile(), fetchImpl: failing })).toEqual({ current: '0.1.0', newer: false });
  });

  it('asks GitHub at most once a day, and falls back to the last answer when offline', async () => {
    const file = cacheFile();
    let calls = 0;
    const counting = (async (...a: Parameters<typeof fetch>) => { calls++; return release('v0.3.0')(...a); }) as typeof fetch;
    await checkForUpdate({ current: '0.1.0', cacheFile: file, fetchImpl: counting, now: 1_000 });
    await checkForUpdate({ current: '0.1.0', cacheFile: file, fetchImpl: counting, now: 1_000 + 60_000 });
    expect(calls).toBe(1);
    expect(JSON.parse(readFileSync(file, 'utf8')).latest).toBe('v0.3.0');
    const later = 1_000 + 2 * 24 * 60 * 60 * 1000;
    expect(await checkForUpdate({ current: '0.1.0', cacheFile: file, fetchImpl: failing, now: later })).toMatchObject({ newer: true, latest: 'v0.3.0' });
    writeFileSync(file, 'not json');
    expect((await checkForUpdate({ current: '0.1.0', cacheFile: file, fetchImpl: failing })).newer).toBe(false);
  });

  it('ignores a cache written before the running version (#71)', async () => {
    const file = cacheFile();
    // Cached on v0.1.0 day; the checkout has since been updated to 0.4.0 and v0.4.0 is out.
    writeFileSync(file, JSON.stringify({ checkedAt: 1_000, latest: 'v0.1.0', url: 'https://github.com/x/releases/tag/v0.1.0' }));
    let calls = 0;
    const counting = (async (...a: Parameters<typeof fetch>) => { calls++; return release('v0.4.0')(...a); }) as typeof fetch;
    expect(await checkForUpdate({ current: '0.4.0', cacheFile: file, fetchImpl: counting, now: 1_000 + 60_000 }))
      .toMatchObject({ latest: 'v0.4.0', newer: false });
    expect(calls).toBe(1);
    // Offline right after an update: no stale "latest" older than what runs.
    writeFileSync(file, JSON.stringify({ checkedAt: 1_000, latest: 'v0.1.0', url: 'https://github.com/x/releases/tag/v0.1.0' }));
    expect(await checkForUpdate({ current: '0.4.0', cacheFile: file, fetchImpl: failing, now: 1_000 + 60_000 })).toEqual({ current: '0.4.0', newer: false });
  });

  it('is off with the opt-out variable and in CI', () => {
    expect(updateCheckDisabled({})).toBe(false);
    expect(updateCheckDisabled({ FLOW_TOWER_NO_UPDATE_CHECK: '1' })).toBe(true);
    expect(updateCheckDisabled({ FLOW_TOWER_NO_UPDATE_CHECK: '0' })).toBe(false);
    expect(updateCheckDisabled({ CI: 'true' })).toBe(true);
  });
});
