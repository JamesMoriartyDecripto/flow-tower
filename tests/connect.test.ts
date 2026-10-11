import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

/**
 * `flow-tower connect` (#91). The config goes to a temp FLOW_TOWER_HOME, the heartbeat to a stub hub on
 * 127.0.0.1:0: nothing here touches the real user folder or the network beyond loopback.
 */
const CLI = join(import.meta.dirname, '..', 'bin', 'flow-tower.js');
const home = mkdtempSync(join(tmpdir(), 'flow-tower-connect-'));
afterAll(() => rmSync(home, { recursive: true, force: true }));

const servers: Server[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); });

/** A stub hub answering `status` to every request, capturing headers and bodies. */
async function stubHub(status: number) {
  const seen: { path?: string; body: unknown; headers: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')), headers: req.headers });
      res.statusCode = status;
      res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

/** Async: a synchronous child would block this process, and the stub hub could never answer. */
function connect(args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [CLI, 'connect', ...args], {
      // The timeout kills a stuck child, so the close event fires and the promise settles.
      timeout: 20_000,
      env: { ...process.env, FLOW_TOWER_HOME: home, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const configOf = () => JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')) as Record<string, unknown>;
const configPath = join(home, 'config.json');

describe('flow-tower connect (#91)', () => {
  it('writes a 0600 config with role satellite, keeping an existing key', { timeout: 15_000 }, async () => {
    // Comments and a viewer list the user wrote by hand must survive the merge.
    writeFileSync(configPath, `{
  // who may watch this machine's hub
  "viewers": ["alice@example.com"]
}
`, { mode: 0o600 });
    const hub = await stubHub(204);
    const r = await connect([hub.url, '--token', 'ft_laptop_secretvalue', '--user', 'alice', '--machine', 'laptop']);

    expect(r.status).toBe(0);
    expect(configOf()).toMatchObject({
      viewers: ['alice@example.com'], role: 'satellite', url: hub.url, token: 'ft_laptop_secretvalue',
      user: 'alice', machine: 'laptop',
    });
    // Personal file, like the token store: owner only.
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    // The token is written and sent, never printed.
    expect(r.stdout).not.toContain('ft_laptop_secretvalue');
    expect(r.stderr).not.toContain('ft_laptop_secretvalue');
    expect(r.stdout).toContain(`connected to ${hub.url} as laptop`);
  });

  it('posts one heartbeat with the token and the satellite counters', { timeout: 15_000 }, async () => {
    const hub = await stubHub(204);
    const sent = connect([hub.url, '--token', 'ft_laptop_secretvalue']);
    const r = await sent;
    expect(r.status).toBe(0);
    expect(hub.seen).toHaveLength(1);
    expect(hub.seen[0].path).toBe('/api/heartbeat');
    expect(hub.seen[0].headers['x-flow-tower-token']).toBe('ft_laptop_secretvalue');
    expect(hub.seen[0].body).toMatchObject({ queued: 0, dropped: 0, state: 'online' });
    // The first beat carries the version, like the relay's own heartbeats: the hub lists it right away.
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string };
    expect((hub.seen[0].body as Record<string, unknown>).version).toBe(pkg.version);
  });

  it('on 401 keeps the config and says the token was refused', { timeout: 15_000 }, async () => {
    const hub = await stubHub(401);
    const r = await connect([hub.url, '--token', 'ft_laptop_secretvalue']);
    expect(r.status).toBe(0);
    expect(configOf()).toMatchObject({ role: 'satellite', url: hub.url, token: 'ft_laptop_secretvalue' });
    expect(r.stderr).toContain('refused this token');
    expect(r.stdout).not.toContain('connected to');
  });

  it('on an unreachable hub keeps the config and mentions the queue', { timeout: 15_000 }, async () => {
    // Nothing listens on port 1: the connection is refused at once, no waiting on a timeout.
    const dead = 'http://127.0.0.1:1';
    const r = await connect([dead, '--token', 'ft_laptop_secretvalue']);
    expect(r.status).toBe(0);
    expect(configOf()).toMatchObject({ role: 'satellite', url: dead });
    expect(r.stderr).toContain('cannot reach');
    expect(r.stderr).toContain('queues events');
  });

  it('exits 1 on bad arguments and writes nothing', { timeout: 15_000 }, async () => {
    const other = mkdtempSync(join(tmpdir(), 'flow-tower-connect-bad-'));
    const empty = { FLOW_TOWER_HOME: other };
    // Both a url and a token are required; an unsupported scheme is not a hub.
    expect((await connect(['http://127.0.0.1:1'], empty)).status).toBe(1);
    expect((await connect(['--token', 'ft_x_secretvalue'], empty)).status).toBe(1);
    expect((await connect(['ftp://hub', '--token', 'ft_x_secretvalue'], empty)).status).toBe(1);
    expect(existsSync(join(other, 'config.json'))).toBe(false);
    rmSync(other, { recursive: true, force: true });
  });

  it('never writes anywhere but the config file in the user folder', { timeout: 15_000 }, async () => {
    // The checkout's flow-tower.local.json must not be the target: connect writes the user folder only.
    const local = join(process.cwd(), 'flow-tower.local.json');
    const before = existsSync(local);
    const hub = await stubHub(204);
    const r = await connect([hub.url, '--token', 'ft_laptop_secretvalue']);
    expect(r.status).toBe(0);
    expect(existsSync(local)).toBe(before);
    // The home folder holds the one file this command owns: no tokens.json, no local fallback.
    expect(readdirSync(home).sort()).toEqual(['config.json']);
  });
});
