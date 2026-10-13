import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { startShareSync, type ShareSync } from '../src/server/share-sync.ts';

/**
 * The shared-towers sync loop (#164). A temp user folder holds the config, a temp folder holds the tower,
 * and a stub hub on 127.0.0.1:0 records every upload. Ticks are driven with syncNow(): nothing waits on
 * the timer, and nothing reaches beyond loopback.
 */
const TOKEN = 'ft_laptop_secretvalue';
const root = mkdtempSync(join(tmpdir(), 'flow-tower-sync-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const servers: Server[] = [];
const syncs: ShareSync[] = [];
afterEach(() => {
  syncs.splice(0).forEach((s) => s.stop());
  servers.splice(0).forEach((s) => s.close());
  vi.restoreAllMocks();
});

/** A stub hub: answers `status` to every PUT, and records each upload it received. */
async function stubHub() {
  const puts: { path?: string; token?: string; files: string[] }[] = [];
  const hub = { status: 200, puts };
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'PUT') {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { files: { path: string }[] };
        puts.push({ path: req.url, token: req.headers['x-flow-tower-token'] as string, files: body.files.map((f) => f.path) });
      }
      res.statusCode = hub.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(hub.status === 200 ? { files: 1, bytes: 10 } : { error: 'disk full' }));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hub };
}

/** A fresh user folder and tower folder; the config names one share, `alpha`, unless `shares` says otherwise. */
function setup(url: string, extra: Record<string, unknown> = {}, shares = [{ dir: '', name: 'alpha', files: false }]) {
  const home = mkdtempSync(join(root, 'home-'));
  const dir = mkdtempSync(join(root, 'tower-'));
  writeFileSync(join(dir, 'alpha.tower.yaml'), 'name: alpha\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: start, type: entry, label: Start }\n');
  const config = { role: 'satellite', url, token: TOKEN, ...extra, shares: shares.map((s) => ({ ...s, dir: s.dir || dir })) };
  writeFileSync(join(home, 'config.json'), JSON.stringify(config, null, 2));
  return { home, dir, configPath: join(home, 'config.json') };
}

/** A sync that never ticks on its own: the interval is far away, so only syncNow() drives it. */
function start(home: string, url: string, warn = (_: string) => {}) {
  const sync = startShareSync({ home, url, token: TOKEN, intervalMs: 1_000_000_000, warn });
  syncs.push(sync);
  return sync;
}

describe('shared towers sync (#164)', () => {
  it('uploads on the first sync, and not again when nothing changed', async () => {
    const { url, hub } = await stubHub();
    const { home } = setup(url);
    const sync = start(home, url);

    await sync.syncNow();
    expect(hub.puts).toHaveLength(1);
    expect(hub.puts[0].path).toBe('/api/hub/towers/alpha');
    expect(hub.puts[0].files).toEqual(['alpha.tower.yaml']);
    expect(sync.state()).toEqual([{ name: 'alpha', syncedAt: expect.any(Number) }]);

    await sync.syncNow();
    expect(hub.puts).toHaveLength(1);
  });

  it('uploads again after the YAML is edited', async () => {
    const { url, hub } = await stubHub();
    const { home, dir } = setup(url);
    const sync = start(home, url);
    await sync.syncNow();

    writeFileSync(join(dir, 'alpha.tower.yaml'), 'name: alpha changed\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: start, type: entry, label: Start }\n');
    await sync.syncNow();
    expect(hub.puts).toHaveLength(2);
  });

  it('records the error on a 500 and retries on the next sync', async () => {
    const { url, hub } = await stubHub();
    const { home } = setup(url);
    const warnings: string[] = [];
    const sync = start(home, url, (m) => warnings.push(m));
    hub.status = 500;

    await sync.syncNow();
    expect(sync.state()).toEqual([{ name: 'alpha', error: 'disk full' }]);
    expect(warnings).toHaveLength(1);

    // The same error on the next tick is not logged again: one warning per distinct message.
    await sync.syncNow();
    expect(warnings).toHaveLength(1);
    expect(hub.puts).toHaveLength(2);

    hub.status = 200;
    await sync.syncNow();
    expect(hub.puts).toHaveLength(3);
    expect(sync.state()).toEqual([{ name: 'alpha', syncedAt: expect.any(Number) }]);
  });

  it('keeps the token out of every warning', async () => {
    const { url, hub } = await stubHub();
    const { home } = setup(url);
    const warnings: string[] = [];
    const sync = start(home, url, (m) => warnings.push(m));
    hub.status = 500;
    await sync.syncNow();
    expect(warnings.join('\n')).not.toContain(TOKEN);
  });

  it('uploads nothing while the user has paused sharing', async () => {
    const { url, hub } = await stubHub();
    const { home, dir, configPath } = setup(url, { paused: true });
    const sync = start(home, url);

    await sync.syncNow();
    expect(hub.puts).toHaveLength(0);
    expect(sync.state()).toEqual([]);

    writeFileSync(configPath, JSON.stringify({ role: 'satellite', url, token: TOKEN, paused: false, shares: [{ dir, name: 'alpha', files: false }] }));
    await sync.syncNow();
    expect(hub.puts).toHaveLength(1);
  });

  it('picks up a share added to the config between two syncs', async () => {
    const { url, hub } = await stubHub();
    const { home, dir, configPath } = setup(url, {}, []);
    const sync = start(home, url);
    await sync.syncNow();
    expect(hub.puts).toHaveLength(0);

    writeFileSync(configPath, JSON.stringify({ role: 'satellite', url, token: TOKEN, shares: [{ dir, name: 'alpha', files: false }] }));
    await sync.syncNow();
    expect(hub.puts).toHaveLength(1);
    expect(hub.puts[0].path).toBe('/api/hub/towers/alpha');
  });

  it('reports a folder that disappeared as an error and never unshares it', async () => {
    const { url, hub } = await stubHub();
    const { home, dir } = setup(url);
    const sync = start(home, url);
    await sync.syncNow();

    rmSync(dir, { recursive: true, force: true });
    await sync.syncNow();
    expect(hub.puts).toHaveLength(1);
    expect(sync.state()[0].name).toBe('alpha');
    expect(sync.state()[0].error).toBeTruthy();
    expect(sync.state()[0].syncedAt).toEqual(expect.any(Number));
  });

  it('uploads with the token the config holds now, after connect rotated it', async () => {
    const { url, hub } = await stubHub();
    const { home, dir, configPath } = setup(url);
    const sync = start(home, url);
    await sync.syncNow();
    expect(hub.puts[0].token).toBe(TOKEN);

    // `flow-tower connect` wrote a new token while the server runs: the next upload must carry it.
    const ROTATED = 'ft_laptop_rotatedvalue';
    writeFileSync(configPath, JSON.stringify({ role: 'satellite', url, token: ROTATED, shares: [{ dir, name: 'alpha', files: false }] }));
    writeFileSync(join(dir, 'alpha.tower.yaml'), 'name: alpha rotated\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: start, type: entry, label: Start }\n');
    await sync.syncNow();
    expect(hub.puts).toHaveLength(2);
    expect(hub.puts[1].token).toBe(ROTATED);
  });

  it('re-uploads an unchanged folder to a new hub: the new hub may hold nothing', async () => {
    const first = await stubHub();
    const second = await stubHub();
    const { home, dir, configPath } = setup(first.url);
    const sync = start(home, first.url);
    await sync.syncNow();
    expect(first.hub.puts).toHaveLength(1);

    writeFileSync(configPath, JSON.stringify({ role: 'satellite', url: second.url, token: TOKEN, shares: [{ dir, name: 'alpha', files: false }] }));
    await sync.syncNow();
    expect(second.hub.puts).toHaveLength(1);
  });

  it('stop() clears the timer and later syncs do nothing', async () => {
    const { url, hub } = await stubHub();
    const { home } = setup(url);
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const sync = start(home, url);

    sync.stop();
    expect(clear).toHaveBeenCalled();
    await sync.syncNow();
    expect(hub.puts).toHaveLength(0);
  });
});

