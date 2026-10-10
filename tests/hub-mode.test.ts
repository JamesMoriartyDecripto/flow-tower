import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { authorize, isRemote } from '../src/server/auth';
import { hubGuard, type HubOptions } from '../src/server/hub';
import { createEventHub } from '../src/server/events';
import { tokenStore } from '../src/server/tokens';

/**
 * Hub mode (#83): the guard decides from the socket, the proxy headers and hub.json alone, so it can be
 * driven with a fake req/res — no server needed, and no route is reached unless the request is allowed.
 */
type Req = { method: string; url: string; headers: Record<string, string>; socket: { remoteAddress: string } };

const remote = (method: string, url: string, headers: Record<string, string> = {}): Req => ({ method, url, headers, socket: { remoteAddress: '100.64.0.9' } });
const local = (method: string, url: string, headers: Record<string, string> = {}): Req => ({ method, url, headers, socket: { remoteAddress: '127.0.0.1' } });
/** tailscale serve connects from loopback (so only the header marks it) — the exact case the guard must catch. */
const forwarded = (method: string, url: string, headers: Record<string, string> = {}) => ({ method, url, headers: { 'x-forwarded-for': '100.64.0.9', ...headers }, socket: { remoteAddress: '127.0.0.1' } });

function run(opts: HubOptions, req: Req, route?: (req: IncomingMessage, res: ServerResponse) => void) {
  const sent = { status: 0, body: '' };
  const res = {
    headersSent: false,
    statusCode: 0,
    setHeader() { /* recorded status/body are enough */ },
    end(this: { headersSent: boolean; statusCode: number }, body?: string) {
      this.headersSent = true;
      sent.status = this.statusCode;
      sent.body = body ?? '';
    },
  } as unknown as ServerResponse;
  const next = () => { sent.status = 200; route?.(req as unknown as IncomingMessage, res); };
  hubGuard(opts)(req as unknown as IncomingMessage, res, next);
  return sent;
}

const home = mkdtempSync(join(tmpdir(), 'flow-tower-hub-'));
const servers: ReturnType<typeof createServer>[] = [];
afterAll(() => servers.forEach((s) => s.close()));
writeFileSync(join(home, 'hub.json'), JSON.stringify({ viewers: ['alice@example.com'] }));
const { token } = tokenStore(home).create('dana');
const opts: HubOptions = { hub: true, ingestOnly: false, home };
const ingestOnly: HubOptions = { ...opts, ingestOnly: true };

describe('isRemote (#83)', () => {
  it('is never remote while hub mode is off', () => {
    expect(isRemote(remote('GET', '/') as unknown as IncomingMessage, { hub: false })).toBe(false);
  });

  it('tells a loopback socket from a proxied or off-host one', () => {
    expect(isRemote(local('GET', '/') as unknown as IncomingMessage, { hub: true })).toBe(false);
    expect(isRemote(remote('GET', '/') as unknown as IncomingMessage, { hub: true })).toBe(true);
    expect(isRemote({ ...local('GET', '/'), socket: { remoteAddress: '::ffff:127.0.0.1' } } as unknown as IncomingMessage, { hub: true })).toBe(false);
  });

  it('treats any proxy header as remote, even from a loopback socket (tailscale serve)', () => {
    for (const h of ['x-forwarded-for', 'forwarded', 'x-real-ip', 'tailscale-user-login']) {
      expect(isRemote(local('GET', '/', { [h]: 'x' }) as unknown as IncomingMessage, { hub: true }), h).toBe(true);
    }
  });
});

describe('hub guard: local requests are unchanged (#83)', () => {
  it('lets every local route through, viewing included', () => {
    expect(run(opts, local('GET', '/')).status).toBe(200);
    expect(run(opts, local('GET', '/api/file?path=x')).status).toBe(200);
    expect(run(opts, local('POST', '/api/events')).status).toBe(200);
  });
});

describe('hub guard: remote ingest (#83)', () => {
  it('refuses ingest without a token (401) and lets a per-sender token through', async () => {
    expect(run(opts, remote('POST', '/api/events')).status).toBe(401);
    expect(run(opts, remote('POST', '/v1/logs')).status).toBe(401);
    // With the real route behind it (a real socket: only there can the guard read the peer address).
    const hub = createEventHub(() => undefined, () => undefined, { legacy: opts.legacy, home, hub: true });
    const server = createServer((rq, rs) => hubGuard(opts)(rq, rs, () => hub.handle(rq, rs)));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/events`;
    const post = (headers: Record<string, string>) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '100.64.0.9', ...headers }, body: JSON.stringify({ kind: 'log' }) });
    const accepted = await post({ 'x-flow-tower-token': token });
    expect(accepted.status).toBe(204);
    expect(await accepted.text()).toBe('');
    expect((await post({})).status).toBe(401);
    expect((await post({ 'x-flow-tower-token': 'ft_dana_nope' })).status).toBe(401);
    expect(hub.recent()).toHaveLength(1);
  });
});

describe('hub guard: remote reading (#83)', () => {
  it('refuses host-acting routes outright', () => {
    expect(run(opts, remote('GET', '/api/file?path=x')).status).toBe(403);
    expect(run(opts, remote('POST', '/api/voice/agent')).status).toBe(403);
    expect(run(opts, remote('DELETE', '/api/history')).status).toBe(403);
  });

  it('allows viewing only for a listed tailnet user', () => {
    expect(run(opts, remote('GET', '/api/workspace')).status).toBe(403);
    expect(run(opts, remote('GET', '/api/workspace', { 'tailscale-user-login': 'mallory@example.com' })).status).toBe(403);
    expect(run(opts, forwarded('GET', '/', { 'tailscale-user-login': 'alice@example.com' })).status).toBe(200);
    expect(run(opts, forwarded('GET', '/api/events?since=0', { 'tailscale-user-login': 'alice@example.com' })).status).toBe(200);
  });
});

describe('hub guard: --ingest-only (#83)', () => {
  it('answers 404 on everything but ingest, remote and local alike', () => {
    expect(run(ingestOnly, local('GET', '/')).status).toBe(404);
    expect(run(ingestOnly, local('GET', '/api/workspace')).status).toBe(404);
    expect(run(ingestOnly, local('GET', '/api/file')).status).toBe(404);
    expect(run(ingestOnly, forwarded('POST', '/api/events', { 'x-flow-tower-token': token })).status).toBe(200);
  });
});

describe('cli hub flags (#83)', () => {
  const CLI = resolve('bin/flow-tower.js');
  const empty = mkdtempSync(join(tmpdir(), 'flow-tower-hub-empty-'));
  // A clean environment: a FLOW_TOWER_TOKEN or FLOW_TOWER_HUB from the shell must not decide these runs.
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'serve', 'examples', ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', FLOW_TOWER_HOME: empty },
    });

  it('refuses a non-loopback bind without --hub', () => {
    const r = run('--host', '0.0.0.0');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('without --hub');
  });

  it('refuses hub mode with no token at all, pointing at token add', () => {
    const r = run('--hub');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('flow-tower token add');
  });
});

describe("hub guard: lead review fixes (#83)", () => {
  it("trusts tailscale-user-login only from the local proxy, never on a direct off-host socket", () => {
    expect(run(opts, forwarded("GET", "/", { "tailscale-user-login": "alice@example.com" })).status).toBe(200);
    expect(run(opts, remote("GET", "/", { "tailscale-user-login": "alice@example.com" })).status).toBe(403);
    expect(run(opts, forwarded("GET", "/", { "tailscale-user-login": "mallory@example.com" })).status).toBe(403);
  });

  it("does not tell a remote prober where the user folder is", () => {
    expect(run(opts, remote("GET", "/")).body).not.toContain(home);
  });

  it("lets the hub machine's own hooks ingest without a token, but never an off-host sender", () => {
    const req = (r: Req) => r as unknown as IncomingMessage;
    expect(authorize(req(local("POST", "/api/events")), { home, hub: true }).ok).toBe(true);
    expect(authorize(req(forwarded("POST", "/api/events")), { home, hub: true }).ok).toBe(false);
    expect(authorize(req(remote("POST", "/api/events", { "x-flow-tower-token": token })), { home, hub: true })).toEqual({ ok: true, sender: "dana" });
    // FLOW_TOWER_TOKEN set: everyone needs it, as before #83.
    expect(authorize(req(local("POST", "/api/events")), { home, hub: true, legacy: "s3cret" }).ok).toBe(false);
  });
});
