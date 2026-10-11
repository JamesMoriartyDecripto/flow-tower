import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { hubViews } from '../src/server/hub-views';
import { createSatellites } from '../src/server/satellites';
import { tokenStore } from '../src/server/tokens';

/**
 * The Hub panel's reading routes (#92). A fake req/res drives the handlers directly, like
 * tests/hub-mode.test.ts does; the temp home keeps the token store off the real user folder.
 */
type Req = { method: string; url: string; headers: Record<string, string>; socket: { remoteAddress: string } };

/** A direct request from this machine: the operator, or a hook — never a viewer behind the proxy. */
const local = (method: string, url: string, headers: Record<string, string> = {}): Req =>
  ({ method, url, headers, socket: { remoteAddress: '127.0.0.1' } });

/** tailscale serve connects from loopback, so only the login header marks a remote viewer. */
const forwarded = (method: string, url: string, headers: Record<string, string> = {}): Req =>
  ({ method, url, headers: { 'tailscale-user-login': 'alice@example.com', ...headers }, socket: { remoteAddress: '127.0.0.1' } });

/** Run one handler against a fake res and capture the status and body it wrote. */
function call(handler: (req: IncomingMessage, res: ServerResponse) => void, req: Req) {
  const sent = { status: 0, body: '', cache: '' };
  const res = {
    statusCode: 0,
    setHeader(this: { cache: string }, name: string, value: string) { if (name === 'Cache-Control') this.cache = value; },
    end(this: { statusCode: number; cache: string }, body?: string) {
      sent.status = this.statusCode;
      sent.body = body ?? '';
      sent.cache = this.cache;
    },
  } as unknown as ServerResponse;
  handler(req as unknown as IncomingMessage, res);
  return sent;
}

const homes: string[] = [];
afterEach(() => homes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true })));

const tempHome = () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-hub-views-'));
  homes.push(home);
  return home;
};

describe('hub views: /api/hub/machines (#92)', () => {
  it('answers a loopback request with the machine rows and no-store', () => {
    const home = tempHome();
    const { token } = tokenStore(home).create('dana');
    const satellites = createSatellites();
    const views = hubViews({ satellites, home, hub: false });
    const res = call(views.machines, local('GET', '/api/hub/machines'));

    expect(res.status).toBe(200);
    expect(res.cache).toBe('no-store');
    const rows = JSON.parse(res.body) as { sender: string; token: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sender: 'dana', token: 'ft_dana…' });
    // Metadata only: never the hash, never the plaintext the CLI produced.
    expect(res.body).not.toContain('sha256');
    expect(res.body).not.toContain(token);
  });

  it('refuses a POST with 405, and a cross-site request with 403', () => {
    const home = tempHome();
    const views = hubViews({ satellites: createSatellites(), home, hub: false });
    expect(call(views.machines, local('POST', '/api/hub/machines')).status).toBe(405);
    expect(call(views.machines, local('GET', '/api/hub/machines', { origin: 'http://localhost:3000' })).status).toBe(403);
  });
});

describe('hub views: /api/hub/me (#92)', () => {
  it('reports the local operator as not read-only, whatever the token count', () => {
    const home = tempHome();
    tokenStore(home).create('dana');
    const views = hubViews({ satellites: createSatellites(), home, hub: true });
    const res = call(views.me, local('GET', '/api/hub/me'));

    expect(res.status).toBe(200);
    expect(res.cache).toBe('no-store');
    expect(JSON.parse(res.body)).toMatchObject({ hub: true, readOnly: false, online: 0, tokens: 1 });
  });

  it('reports a tailscale viewer in hub mode as read-only', () => {
    const home = tempHome();
    const views = hubViews({ satellites: createSatellites(), home, hub: true });
    const res = call(views.me, forwarded('GET', '/api/hub/me'));

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ hub: true, readOnly: true });
  });

  it('refuses a POST with 405', () => {
    const home = tempHome();
    const views = hubViews({ satellites: createSatellites(), home, hub: false });
    expect(call(views.me, local('POST', '/api/hub/me')).status).toBe(405);
  });
});
