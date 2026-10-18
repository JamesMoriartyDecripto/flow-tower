import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { listShares, shareFolder, unshareFolder } from '../src/server/share-actions.ts';

/**
 * The share actions behind `flow-tower share` and the server routes (#164, #266). The user folder is a temp
 * home with a config.json; the hub is a stub on 127.0.0.1:0, so nothing here reaches the network beyond loopback.
 */
const TOKEN = 'ft_laptop_secretvalue';
const home = mkdtempSync(join(tmpdir(), 'flow-tower-share-actions-'));
const configPath = join(home, 'config.json');
const folders: string[] = [];
afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  for (const dir of folders) rmSync(dir, { recursive: true, force: true });
});

const servers: Server[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); });

/** A stub hub answering `status` to every request; `list` is what the GET answers. */
async function stubHub(status: number, list: string[] = []) {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      if (status !== 200 && status !== 204) res.end(JSON.stringify({ error: 'name is taken' }));
      else if (req.method === 'GET') res.end(JSON.stringify({ towers: list }));
      else res.end(JSON.stringify({ files: 1, bytes: 10 }));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A port nothing listens on: the connection is refused at once. */
async function closedUrl() {
  const closed = createServer();
  await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
  const port = (closed.address() as AddressInfo).port;
  await new Promise<void>((r) => closed.close(() => r()));
  return `http://127.0.0.1:${port}`;
}

const connectedConfig = (url: string, extra: Record<string, unknown> = {}) => {
  writeFileSync(configPath, JSON.stringify({ role: 'satellite', url, token: TOKEN, ...extra }, null, 2), { mode: 0o600 });
};
const configOf = () => JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
const reset = () => rmSync(configPath, { force: true });

/** A folder with one tower file, so the collector has something to send. */
function towerFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-share-actions-src-'));
  folders.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'alpha.tower.yaml'), [
    'version: 1',
    'name: Alpha',
    'description: Test tower.',
    'root: .',
    'runtimes:',
    '  box:',
    '    kind: cloud',
    '    label: Box',
    'agents:',
    '  a:',
    '    name: A',
    '    model: m',
    '    runtime: box',
    'layers:',
    '  - id: l',
    '    title: L',
    '    description: L',
    '    nodes:',
    '      - id: n',
    '        type: entry',
    '        runtime: box',
    '        label: N',
    '        description: N',
    '        trigger: { kind: manual, source: user }',
    '',
  ].join('\n'));
  return dir;
}

describe('shareFolder (#266)', () => {
  it('records the share and adds the folder to the library', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await stubHub(200));
    const dir = towerFolder();
    const r = await shareFolder(home, dir, { files: false, name: 'alpha' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('alpha');
    expect(r.sender).toBe('laptop');
    expect(r.files.map((f) => f.path)).toEqual(['alpha.tower.yaml']);
    expect(configOf().shares).toEqual([{ dir, name: 'alpha', files: false }]);
    expect(configOf().library).toEqual([dir]);
  });

  it('a hub refusal records nothing and returns the hub error', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await stubHub(400));
    const r = await shareFolder(home, towerFolder(), { files: false, name: 'refused' });

    expect(r).toMatchObject({ ok: false, recorded: false });
    expect(r.ok ? '' : r.error).toContain('name is taken');
    expect(configOf().shares).toBeUndefined();
    expect(configOf().library).toBeUndefined();
  });

  it('not connected returns the "not connected" error and sends nothing', async () => {
    reset();
    const r = await shareFolder(home, towerFolder(), { files: false, name: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^not connected: run .+ connect <hub-url> first$/);
    expect(r.recorded).toBe(false);
  });

  it('an invalid share name is refused before anything is sent', async () => {
    reset();
    connectedConfig('http://127.0.0.1:1');
    const r = await shareFolder(home, towerFolder(), { files: false, name: 'Bad Name' });
    expect(r).toMatchObject({ ok: false, recorded: false });
    expect(r.ok ? '' : r.error).toContain('not a share name: "Bad Name"');
  });
});

describe('unshareFolder (#266)', () => {
  it('a 404 from the hub drops the entry and reports gone', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await stubHub(404), { shares: [{ dir: '/x/zeta', name: 'zeta', files: false }] });
    const r = await unshareFolder(home, 'zeta', { force: false });

    expect(r).toEqual({ ok: true, name: 'zeta', gone: true, hubReached: true });
    expect(configOf().shares).toEqual([]);
  });

  it('an unreachable hub keeps the entry without force and drops it with force', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await closedUrl(), { shares: [{ dir: '/x/delta', name: 'delta', files: false }] });

    const kept = await unshareFolder(home, 'delta', { force: false });
    expect(kept.ok).toBe(false);
    expect(configOf().shares).toHaveLength(1);

    const forced = await unshareFolder(home, 'delta', { force: true });
    expect(forced).toEqual({ ok: true, name: 'delta', gone: false, hubReached: false });
    expect(configOf().shares).toEqual([]);
  });

  it('an unknown target lists the known names', async () => {
    reset();
    connectedConfig('http://127.0.0.1:1', { shares: [{ dir: '/x/beta', name: 'beta', files: false }] });
    const r = await unshareFolder(home, 'nope', { force: false });
    expect(r).toEqual({ ok: false, error: 'no share named or at "nope". known shares: beta', known: ['beta'] });
  });

  it('with byName a folder path matches nothing', async () => {
    reset();
    connectedConfig('http://127.0.0.1:1', { shares: [{ dir: '/x/gamma', name: 'gamma', files: false }] });
    const r = await unshareFolder(home, '/x/gamma', { force: true, byName: true });
    expect(r.ok).toBe(false);
    expect(configOf().shares).toHaveLength(1);
  });

  it('an unreachable hub without force is flagged unreachable', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await closedUrl(), { shares: [{ dir: '/x/eta', name: 'eta', files: false }] });
    const r = await unshareFolder(home, 'eta', { force: false });
    expect(r).toMatchObject({ ok: false, unreachable: true });
  });
});

describe('config writes are queued (#266)', () => {
  it('two shareFolder calls started together both end up recorded', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await stubHub(200));
    const one = towerFolder();
    const two = towerFolder();
    const [a, b] = await Promise.all([
      shareFolder(home, one, { files: false, name: 'one' }),
      shareFolder(home, two, { files: false, name: 'two' }),
    ]);

    expect(a.ok && b.ok).toBe(true);
    const names = (configOf().shares as { name: string }[]).map((s) => s.name).sort();
    expect(names).toEqual(['one', 'two']);
  });

  it('re-sharing a folder in the other mode replaces its entry', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await stubHub(200));
    const dir = towerFolder();
    await shareFolder(home, dir, { files: false, name: 'swap' });
    const again = await shareFolder(home, dir, { files: true, name: 'swap' });

    expect(again.ok).toBe(true);
    const shares = configOf().shares as { dir: string; name: string; files: boolean }[];
    expect(shares).toEqual([{ dir, name: 'swap', files: true }]);
  });

  it('a re-share of a renamed tower keeps the recorded name and one entry', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await stubHub(200));
    const dir = towerFolder(); // its tower is named Alpha, so the derived name would be `alpha`
    connectedConfig(configOf().url as string, { shares: [{ dir, name: 'old-name', files: false }] });
    const r = await shareFolder(home, dir, { files: true });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('old-name');
    expect(configOf().shares).toEqual([{ dir, name: 'old-name', files: true }]);
  });

  it('a derived name held by another folder share is a conflict and records nothing', { timeout: 30_000 }, async () => {
    reset();
    const other = '/x/other-folder';
    connectedConfig('http://127.0.0.1:1', { shares: [{ dir: other, name: 'alpha', files: false }] });
    const dir = towerFolder(); // derives `alpha`, which the other folder holds
    const r = await shareFolder(home, dir, { files: false });

    expect(r).toMatchObject({ ok: false, recorded: false, conflict: true });
    expect(r.ok ? '' : r.error).toBe(`the name alpha is already used by ${other}: unshare it first, or share with --name`);
    expect(configOf().shares).toEqual([{ dir: other, name: 'alpha', files: false }]);
  });
});

describe('listShares (#266)', () => {
  it('returns the local entries and the hub list', { timeout: 30_000 }, async () => {
    reset();
    connectedConfig(await stubHub(200, ['beta']), {
      shares: [{ dir: '/x/beta', name: 'beta', files: false }, { dir: '/x/ghost', name: 'ghost', files: true }],
    });
    const r = await listShares(home);

    expect(r.shares.map((s) => s.name)).toEqual(['beta', 'ghost']);
    expect(r.hub).toEqual({ ok: true, towers: ['beta'] });
  });

  it('has no hub part when the user is not connected', async () => {
    reset();
    writeFileSync(configPath, JSON.stringify({ shares: [{ dir: '/x/beta', name: 'beta', files: false }] }));
    const r = await listShares(home);
    expect(r).toEqual({ shares: [{ dir: '/x/beta', name: 'beta', files: false }] });
  });
});
