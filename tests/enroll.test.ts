import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { enrollHandler, hostnameOf } from '../src/server/enroll';
import { tokenStore } from '../src/server/tokens';

/**
 * POST /api/hub/enroll (#164) on a real http server bound to loopback, so the handler sees a real socket
 * address (the login header is trusted only from loopback). Host is set by hand: a tailnet name is what
 * tailscale serve forwards, and the handler must refuse any other.
 */
const VIEWER = 'ana@example.com';
const home = mkdtempSync(join(tmpdir(), 'flow-tower-enroll-'));
const OTHER = 'bo@example.com';
writeFileSync(join(home, 'config.json'), JSON.stringify({ hub: true, viewers: [VIEWER, OTHER] }));

const servers: Server[] = [];
/** A hub server with the handler mounted at the enrol path; `hub` decides whether it is a hub at all. */
async function serve(hub: boolean): Promise<number> {
  const handler = enrollHandler({ home, hub });
  const server = createServer((req, res) => {
    if (req.url === '/api/hub/enroll') return void handler(req, res);
    res.statusCode = 404;
    res.end();
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
}

interface Reply { status: number; cache: string; body: Record<string, unknown> }

/** One POST with the given headers; the body is sent as-is so a test can send a bad one. */
function post(port: number, headers: Record<string, string>, body: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/hub/enroll', method: 'POST', headers: { 'content-type': 'application/json', host: 'hub.tail1234.ts.net', ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, cache: String(res.headers['cache-control']), body: text ? JSON.parse(text) : {} }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const login = { 'tailscale-user-login': VIEWER };
const ok = (machine: string) => JSON.stringify({ machine });

afterAll(() => {
  servers.forEach((s) => s.close());
  rmSync(home, { recursive: true, force: true });
});

describe('hostnameOf (#164)', () => {
  it('strips a trailing port from a name', () => {
    expect(hostnameOf('Hub.Tail1234.ts.net:443')).toBe('hub.tail1234.ts.net');
    expect(hostnameOf('hub.ts.net')).toBe('hub.ts.net');
  });

  it('keeps the brackets of an IPv6 literal and strips only the port after them', () => {
    expect(hostnameOf('[::1]:8443')).toBe('[::1]');
    expect(hostnameOf('[::1]')).toBe('[::1]');
    expect(hostnameOf('[2001:db8::1]:443')).toBe('[2001:db8::1]');
  });

  it('does not treat the colons inside an IPv6 literal as a port', () => {
    expect(hostnameOf('[2001:db8::1]')).toBe('[2001:db8::1]');
  });
});

describe('enrolment: POST /api/hub/enroll (#164)', () => {
  it('enrols a viewer machine on a tailnet host and the token verifies', async () => {
    const port = await serve(true);
    const r = await post(port, login, ok('laptop'));
    expect(r.status).toBe(200);
    expect(r.cache).toBe('no-store');
    expect(r.body).toMatchObject({ machine: 'laptop', rotated: false });
    expect(tokenStore(home).verify(r.body.token)).toEqual({ id: 'laptop' });
  });

  it('refuses a request with no tailnet login header (403)', async () => {
    const port = await serve(true);
    expect((await post(port, {}, ok('tablet'))).status).toBe(403);
  });

  it('refuses a login that is not a viewer (403)', async () => {
    const port = await serve(true);
    const r = await post(port, { 'tailscale-user-login': 'mallory@example.com' }, ok('tablet'));
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'your tailnet login is not a viewer of this hub' });
  });

  it('refuses a Host that is not a tailnet name (403)', async () => {
    const port = await serve(true);
    const r = await post(port, { ...login, host: 'hub.example.com' }, ok('tablet'));
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'enrolment needs a tailnet hub (tailscale serve)' });
  });

  it('answers 404 when this server is not a hub', async () => {
    const port = await serve(false);
    const r = await post(port, login, ok('tablet'));
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not a hub' });
  });

  it('refuses a body that is not application/json (415)', async () => {
    const port = await serve(true);
    expect((await post(port, { ...login, 'content-type': 'text/plain' }, ok('tablet'))).status).toBe(415);
  });

  it('refuses a cross-site request (403)', async () => {
    const port = await serve(true);
    expect((await post(port, { ...login, origin: 'https://evil.example' }, ok('tablet'))).status).toBe(403);
  });

  it('refuses a machine id that is not a slug (400)', async () => {
    const port = await serve(true);
    expect((await post(port, login, ok('Bad Name'))).status).toBe(400);
    expect((await post(port, login, JSON.stringify({ machine: 7 }))).status).toBe(400);
    expect((await post(port, login, 'not json')).status).toBe(400);
  });

  it('refuses a second login taking over an enrolled machine (409)', async () => {
    const port = await serve(true);
    await post(port, login, ok('desk'));
    const r = await post(port, { 'tailscale-user-login': OTHER }, ok('desk'));
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toMatch(/^conflict:/);
  });

  it('lets the same login enrol again, which rotates the token (200, rotated true)', async () => {
    const port = await serve(true);
    const first = await post(port, login, ok('phone'));
    const second = await post(port, login, ok('phone'));
    expect(second.status).toBe(200);
    expect(second.body.rotated).toBe(true);
    expect(tokenStore(home).verify(first.body.token)).toBeUndefined();
    expect(tokenStore(home).verify(second.body.token)).toEqual({ id: 'phone' });
  });

  it('answers a body over 4 KB with 413', async () => {
    const port = await serve(true);
    const r = await post(port, login, JSON.stringify({ machine: 'x'.repeat(5000) }));
    expect(r.status).toBe(413);
  });
});
