import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharingTowersHandler } from '../src/server/sharing-towers';

/**
 * The local route behind the Settings list of shared towers (#266). The stub hub, the temp config home and the
 * temp project folder all live on this machine: nothing here touches the real user folder or the network
 * beyond loopback.
 */
const homes: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  servers.splice(0).forEach((s) => s.close());
  homes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true }));
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  homes.push(dir);
  return dir;
};

/** A stub hub answering every request with `status`; a 2xx accepts, anything else refuses. */
async function stubHub(status = 204) {
  const seen: { method?: string; path?: string }[] = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, path: req.url });
    req.resume();
    req.on('end', () => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(status === 204 ? undefined : JSON.stringify({ error: 'refused' }));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

const MOUNT = '/api/sharing/towers';

/** A home with a config that names the stub hub, or with no config at all when `hub` is undefined. */
function homeWith(hub: string | undefined, extra: Record<string, unknown> = {}) {
  const home = tempDir('flow-tower-towers-home-');
  if (hub) writeFileSync(join(home, 'config.json'), JSON.stringify({ url: hub, token: 'ft_demo_secret', ...extra }), { mode: 0o600 });
  return home;
}

/** One project folder named `demo`, holding one tower file: the share name comes out as `demo`. */
function projectFolder() {
  const root = tempDir('flow-tower-towers-project-');
  const dir = join(root, 'demo');
  mkdirSync(dir);
  // One node: the loader refuses a tower with no layer, and a refused folder never reaches the hub.
  writeFileSync(join(dir, 'demo.tower.yaml'), 'name: demo\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: start, type: entry, label: Start }\n');
  return dir;
}

/** The handler behind a real server, mounted the way plugin.ts mounts it (prefix stripped from req.url). */
async function start(opts: { home: string; hub?: boolean; sync?: () => unknown; dir?: string }) {
  const sync = opts.sync ?? (() => undefined);
  const handler = sharingTowersHandler({
    home: opts.home,
    hub: opts.hub ?? false,
    sync: sync as Parameters<typeof sharingTowersHandler>[0]['sync'],
    dirOf: (id) => (id === 'demo' ? opts.dir : undefined),
  });
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '';
    if (!(url === MOUNT || url.startsWith(`${MOUNT}/`) || url.startsWith(`${MOUNT}?`))) { res.statusCode = 404; res.end(); return; }
    req.url = url.slice(MOUNT.length) || '/';
    void handler.towers(req, res, () => { res.statusCode = 404; res.end(); });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}${MOUNT}`;
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const readConfig = (home: string) => JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')) as Record<string, unknown>;

describe('the local shared-towers route (#266)', () => {
  it('lists the recorded shares with the sync state', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const dir = projectFolder();
    const home = homeWith(hub.url, { shares: [{ dir, name: 'demo', files: false }] });
    const sync = { state: () => [{ name: 'demo', syncedAt: 1234 }], syncNow: vi.fn(async () => {}) };
    const url = await start({ home, dir, sync: () => sync });

    const r = await fetch(url);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ shares: [{ name: 'demo', dir, files: false, syncedAt: 1234 }] });
    expect(hub.seen).toHaveLength(0); // the 5 s poll never reaches the hub
  });

  it('shares a project, records it, and calls syncNow', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const dir = projectFolder();
    const home = homeWith(hub.url);
    const syncNow = vi.fn(async () => {});
    const url = await start({ home, dir, sync: () => ({ state: () => [], syncNow }) });

    const r = await post(url, { project: 'demo', files: false });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'demo', files: 1, sender: 'demo' });
    expect(JSON.stringify(body)).not.toContain('ft_demo_secret'); // the token never leaves the server
    expect(readConfig(home).shares).toEqual([{ dir, name: 'demo', files: false }]);
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('unshares by name and drops the entry', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const dir = projectFolder();
    const home = homeWith(hub.url, { shares: [{ dir, name: 'demo', files: false }] });
    const syncNow = vi.fn(async () => {});
    const url = await start({ home, dir, sync: () => ({ state: () => [], syncNow }) });

    const r = await post(url, { unshare: 'demo' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ name: 'demo', hubReached: true });
    expect(readConfig(home).shares).toEqual([]);
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('answers 404 for an unknown project, 409 when not connected, and 502 when the hub refuses', { timeout: 5_000 }, async () => {
    const dir = projectFolder();

    const hub = await stubHub();
    const connected = await start({ home: homeWith(hub.url), dir });
    expect((await post(connected, { project: 'nope', files: false })).status).toBe(404);

    const offline = await start({ home: homeWith(undefined), dir });
    const notConnected = await post(offline, { project: 'demo', files: false });
    expect(notConnected.status).toBe(409);

    const refusing = await stubHub(500);
    const homeRefused = homeWith(refusing.url);
    const url = await start({ home: homeRefused, dir });
    const refused = await post(url, { project: 'demo', files: false });
    expect(refused.status).toBe(502);
    expect(readConfig(homeRefused).shares).toBeUndefined(); // a refused share records nothing
  });

  it('refuses a cross-site POST, a non-JSON POST and an oversize body', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const dir = projectFolder();
    const home = homeWith(hub.url);
    const url = await start({ home, dir });

    expect((await post(url, { project: 'demo', files: false }, { Origin: 'http://localhost:3000' })).status).toBe(403);
    const form = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;x=application/json' }, body: JSON.stringify({ project: 'demo', files: false }) });
    expect(form.status).toBe(415);
    const huge = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unshare: 'demo', pad: 'x'.repeat(64 * 1024) }) });
    expect(huge.status).toBe(413);
    expect(readConfig(home).shares).toBeUndefined(); // nothing was shared by any of the three
  });

  it('gives a remote viewer an empty list, never the local folders', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const dir = projectFolder();
    const home = homeWith(hub.url, { shares: [{ dir, name: 'demo', files: false }] });
    const url = await start({ home, dir, hub: true });

    const read = await fetch(url, { headers: { 'X-Forwarded-For': '10.0.0.9' } });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ shares: [] });
    expect((await post(url, { unshare: 'demo' }, { 'X-Forwarded-For': '10.0.0.9' })).status).toBe(403);
    expect(readConfig(home).shares).toHaveLength(1); // the remote POST changed nothing
  });
});
