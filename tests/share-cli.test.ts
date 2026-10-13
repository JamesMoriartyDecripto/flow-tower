import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { shareName } from '../src/server/share-client.ts';
import { withShare, withoutShare } from '../src/server/share-entries.ts';
import { cleanEnv } from './fixtures/clean-env';

/**
 * `flow-tower share` / `unshare` (#164). The user folder is a temp FLOW_TOWER_HOME, the hub is a stub on
 * 127.0.0.1:0: nothing here touches the real user folder or the network beyond loopback.
 */
const CLI = join(import.meta.dirname, '..', 'bin', 'flow-tower.js');
const TOKEN = 'ft_laptop_secretvalue';
const home = mkdtempSync(join(tmpdir(), 'flow-tower-share-'));
const configPath = join(home, 'config.json');
afterAll(() => rmSync(home, { recursive: true, force: true }));

const servers: Server[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); });

type Seen = { method?: string; path?: string; body: unknown; headers: Record<string, string | string[] | undefined> };

/** A stub hub answering `status` to every request (`list` answers the GET), capturing what it was sent. */
async function stubHub(status: number, list: string[] = []) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : undefined, headers: req.headers });
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      if (status !== 200 && status !== 204) res.end(JSON.stringify({ error: 'name is taken' }));
      else if (req.method === 'GET') res.end(JSON.stringify({ towers: list }));
      else res.end(JSON.stringify({ files: 1, bytes: 10 }));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

/** Async: a synchronous child would block this process, and the stub hub could never answer. */
function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      timeout: 20_000,
      env: cleanEnv({ FLOW_TOWER_HOME: home, ...env }),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/** A folder with one tower that references one prompt file, and a secret that must never travel. */
function towerFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-share-src-'));
  mkdirSync(join(dir, 'prompts'));
  writeFileSync(join(dir, 'alpha.tower.yaml'), `version: 1
name: Alpha
description: Test tower.
root: .

runtimes:
  box:
    kind: cloud
    label: Box

agents:
  a:
    name: A
    model: m
    prompt: { file: prompts/a.md }
    runtime: box

layers:
  - id: l
    title: L
    description: L
    nodes:
      - id: n
        type: entry
        runtime: box
        label: N
        description: N
        trigger: { kind: manual, source: user }
`);
  writeFileSync(join(dir, 'prompts', 'a.md'), 'You are A.\n');
  writeFileSync(join(dir, 'prompts', '.env'), 'SECRET=1\n');
  return dir;
}

const connectedConfig = (url: string, extra: Record<string, unknown> = {}) => {
  writeFileSync(configPath, JSON.stringify({ role: 'satellite', url, token: TOKEN, ...extra }, null, 2), { mode: 0o600 });
};
const configOf = () => JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;

describe('flow-tower share (#164)', () => {
  it('sends only the tower file by default and records the share', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(200);
    connectedConfig(hub.url);
    const dir = towerFolder();
    const r = await run(['share', dir]);

    expect(r.status).toBe(0);
    expect(hub.seen).toHaveLength(1);
    expect(hub.seen[0].method).toBe('PUT');
    const sent = (hub.seen[0].body as { files: { path: string }[] }).files.map((f) => f.path);
    expect(sent).toEqual(['alpha.tower.yaml']);
    expect(r.stdout).toContain('YAML only');
    expect(r.stdout).toContain('it appears on the hub as towers/laptop/');
    expect(configOf().shares).toEqual([{ dir, name: shareName(dir), files: false }]);
    expect(r.stdout).not.toContain(TOKEN);
    expect(r.stderr).not.toContain(TOKEN);
  });

  it('sends the referenced prompt with --files and names the skipped secret', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(200);
    connectedConfig(hub.url);
    const dir = towerFolder();
    const r = await run(['share', dir, '--files', '--name', 'alpha-box']);

    expect(r.status).toBe(0);
    const sent = (hub.seen[0].body as { files: { path: string }[] }).files.map((f) => f.path).sort();
    expect(sent).toEqual(['alpha.tower.yaml', 'prompts/a.md']);
    expect(r.stdout).toContain('YAML and referenced files');
    expect(configOf().shares).toEqual([{ dir, name: 'alpha-box', files: true }]);
  });

  it('exits 1 when not connected, and sends nothing', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const r = await run(['share', towerFolder()]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not connected: run (flow-tower|node \S+bin\/flow-tower\.js) connect <hub-url> first/);
  });

  it('exits 1 on a 400 from the hub and records no share', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(400);
    connectedConfig(hub.url);
    const r = await run(['share', towerFolder()]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('name is taken');
    expect(configOf().shares).toBeUndefined();
  });

  it('unshare sends DELETE and drops the entry', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(204);
    connectedConfig(hub.url, { shares: [{ dir: '/x/beta', name: 'beta', files: false }] });
    const r = await run(['unshare', 'beta']);

    expect(r.status).toBe(0);
    expect(hub.seen[0].method).toBe('DELETE');
    expect(hub.seen[0].path).toBe('/api/hub/towers/beta');
    expect(r.stdout).toContain('unshared beta');
    expect(configOf().shares).toEqual([]);
  });

  it('unshare drops the entry when the hub holds nothing under that name (404)', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(404);
    connectedConfig(hub.url, { shares: [{ dir: '/x/zeta', name: 'zeta', files: false }] });
    const r = await run(['unshare', 'zeta']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('unshared zeta (it was not on the hub)');
    expect(configOf().shares).toEqual([]);
  });

  it('unshare by dir still drops the entry', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(204);
    connectedConfig(hub.url, { shares: [{ dir: '/x/gamma', name: 'gamma', files: true }] });
    expect((await run(['unshare', '/x/gamma'])).status).toBe(0);
    expect(configOf().shares).toEqual([]);
  });

  it('unknown name exits 1 and lists the known names', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(204);
    connectedConfig(hub.url, { shares: [{ dir: '/x/beta', name: 'beta', files: false }] });
    const r = await run(['unshare', 'nope']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('known shares: beta');
    expect(hub.seen).toHaveLength(0);
  });

  it('an unreachable hub keeps the share unless --force', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    // Nothing listens on port 1: the connection is refused at once.
    connectedConfig('http://127.0.0.1:1', { shares: [{ dir: '/x/delta', name: 'delta', files: false }] });
    const kept = await run(['unshare', 'delta']);
    expect(kept.status).toBe(1);
    expect(configOf().shares).toHaveLength(1);

    const forced = await run(['unshare', 'delta', '--force']);
    expect(forced.status).toBe(0);
    expect(configOf().shares).toEqual([]);
  });

  it('share --list prints the config names and the hub names', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(200, ['beta']);
    connectedConfig(hub.url, { shares: [{ dir: '/x/beta', name: 'beta', files: false }, { dir: '/x/ghost', name: 'ghost', files: true }] });
    const r = await run(['share', '--list']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('beta');
    expect(r.stdout).toContain('ghost  /x/ghost  YAML and referenced files  (missing on the hub)');
    expect(r.stdout).toContain('on the hub: beta');
    expect(r.stdout).not.toContain(TOKEN);
  });

  it('never prints the token, even when the hub refuses', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(400);
    connectedConfig(hub.url);
    const r = await run(['share', towerFolder(), '--name', 'alpha']);
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
  });

  it('prints each sent path, indented', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(200);
    connectedConfig(hub.url);
    const r = await run(['share', towerFolder(), '--files', '--name', 'listed']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('  alpha.tower.yaml\n');
    expect(r.stdout).toContain('  prompts/a.md\n');
    expect(r.stdout).not.toContain('.env');
  });

  it('adds the shared folder to the library, once', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(200);
    connectedConfig(hub.url);
    const dir = towerFolder();
    const first = await run(['share', dir, '--name', 'lib-once']);

    expect(first.status).toBe(0);
    expect(first.stdout).toContain(`added to your library: ${dir}`);
    expect(configOf().library).toEqual([dir]);

    const second = await run(['share', dir, '--name', 'lib-once']);
    expect(second.status).toBe(0);
    expect(second.stdout).not.toContain('added to your library');
    expect(configOf().library).toEqual([dir]);
  });

  it('a share the hub refused does not add the folder to the library', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(400);
    connectedConfig(hub.url);
    const r = await run(['share', towerFolder()]);
    expect(r.status).toBe(1);
    expect(configOf().library).toBeUndefined();
  });

  it('unshare leaves the library alone', { timeout: 30_000 }, async () => {
    rmSync(configPath, { force: true });
    const hub = await stubHub(204);
    connectedConfig(hub.url, { shares: [{ dir: '/x/eta', name: 'eta', files: false }], library: ['/x/eta'] });
    const r = await run(['unshare', 'eta']);
    expect(r.status).toBe(0);
    expect(configOf().library).toEqual(['/x/eta']);
    expect(r.stdout).not.toContain('library');
  });
});

describe('share list edits (#164): a write builds on the entries on disk', () => {
  const beta = { dir: '/x/beta', name: 'beta', files: false };
  const gamma = { dir: '/x/gamma', name: 'gamma', files: true };

  it('withShare adds the entry and keeps the others', () => {
    expect(withShare([beta], gamma)).toEqual([beta, gamma]);
  });

  it('withShare replaces an entry with the same name or the same folder', () => {
    expect(withShare([beta, gamma], { dir: '/x/other', name: 'beta', files: true })).toEqual([gamma, { dir: '/x/other', name: 'beta', files: true }]);
    expect(withShare([beta], { dir: '/x/beta', name: 'beta2', files: false })).toEqual([{ dir: '/x/beta', name: 'beta2', files: false }]);
  });

  it('withShare keeps a hand-edited entry the schema refuses', () => {
    const broken = { dir: 42 };
    expect(withShare([broken, beta], gamma)).toEqual([broken, beta, gamma]);
  });

  it('withoutShare drops the named entry only', () => {
    expect(withoutShare([beta, gamma], 'beta')).toEqual([gamma]);
    expect(withoutShare([beta], 'nope')).toEqual([beta]);
  });
});
