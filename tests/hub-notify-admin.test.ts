import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { hubAdmin } from '../src/server/hub-admin';
import { readAudit } from '../src/server/admin-audit';
import { readUserConfig } from '../src/server/user-config';
import { isLoopbackUrl, notifyUrlValid } from '../src/app/hud/hubAdminModel';

/**
 * Notifications in Hub › Admin (#191), on loopback http servers only (port 0). The test webhook is a local
 * server too, so nothing here reaches the network. The webhook url carries a fake token: the tests check it
 * never appears in a reply or in the audit log.
 */
const home = mkdtempSync(join(tmpdir(), 'flow-tower-notify-admin-'));
const servers: Server[] = [];
const TOKEN = 'secret-token-123';
const REMOTE = { 'x-forwarded-for': '203.0.113.9' };

afterAll(() => {
  servers.forEach((s) => s.close());
  rmSync(home, { recursive: true, force: true });
});

/** A local webhook receiver that records each POST body and answers with `status`. */
async function receiver(status = 200): Promise<{ port: number; bodies: string[] }> {
  const bodies: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let text = '';
    req.on('data', (c) => { text += c; });
    req.on('end', () => { bodies.push(text); res.statusCode = status; res.end(); });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { port: (server.address() as AddressInfo).port, bodies };
}

async function serve(hub = true): Promise<number> {
  const handler = hubAdmin({ home, hub, hubUrl: () => 'https://hub.tail1234.ts.net' });
  // The same mount-prefix strip plugin.ts does, so the handler sees the paths it routes on.
  const server = createServer((req, res) => {
    req.url = (req.url ?? '').replace(/^\/api\/hub\/admin/, '') || '/';
    void handler(req, res);
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
}

interface Reply { status: number; body: unknown; text: string }

function call(port: number, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json', host: 'hub.local', ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, body: text ? JSON.parse(text) : undefined }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

const auditText = () => readFileSync(join(home, 'admin-audit.jsonl'), 'utf8');

describe('notify admin: loopback only (#191)', () => {
  it('refuses PUT, DELETE and test from a remote request with 404 and changes nothing', async () => {
    const port = await serve();
    const url = `http://127.0.0.1:1/${TOKEN}`;
    expect((await call(port, 'PUT', '/api/hub/admin/notify', { url, format: 'ntfy' }, REMOTE)).status).toBe(404);
    expect((await call(port, 'DELETE', '/api/hub/admin/notify', undefined, REMOTE)).status).toBe(404);
    expect((await call(port, 'POST', '/api/hub/admin/notify/test', {}, REMOTE)).status).toBe(404);
    expect(readUserConfig(home).notify).toBeUndefined();
  });

  it('refuses a cross-site PUT with 403', async () => {
    const port = await serve();
    const r = await call(port, 'PUT', '/api/hub/admin/notify', { url: 'https://ntfy.sh/x', format: 'ntfy' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });
});

describe('notify admin: set, mask, remove (#191)', () => {
  it('stores a valid webhook and answers only the masked host, never the url', async () => {
    const port = await serve();
    const url = `https://ntfy.sh/${TOKEN}`;
    expect((await call(port, 'PUT', '/api/hub/admin/notify', { url, format: 'ntfy' })).status).toBe(204);
    expect(readUserConfig(home).notify).toEqual({ url, format: 'ntfy' });
    const r = await call(port, 'GET', '/api/hub/admin');
    expect(r.body).toMatchObject({ notify: { set: true, format: 'ntfy', host: 'ntfy.sh' } });
    expect(r.text).not.toContain(TOKEN);
  });

  it('refuses a plain-http webhook off this machine (the schema decides, the route follows it)', async () => {
    const port = await serve();
    const r = await call(port, 'PUT', '/api/hub/admin/notify', { url: 'http://192.168.1.20/x', format: 'json' });
    expect(r.status).toBe(400);
  });

  it('removes the webhook and writes one notify.remove line with the host only', async () => {
    const port = await serve();
    const before = readAudit(home, 1000).length;
    expect((await call(port, 'DELETE', '/api/hub/admin/notify')).status).toBe(204);
    expect(readUserConfig(home).notify).toBeUndefined();
    const lines = readAudit(home, 1000);
    expect(lines.length).toBe(before + 1);
    expect(lines[0]).toMatchObject({ action: 'notify.remove', detail: { host: 'ntfy.sh', format: 'ntfy' } });
    expect(auditText()).not.toContain(TOKEN);
  });

  it('writes an audit line for set with format and host, never the url', async () => {
    const port = await serve();
    await call(port, 'PUT', '/api/hub/admin/notify', { url: `https://hooks.example.com/${TOKEN}`, format: 'slack' });
    const line = readAudit(home, 1)[0];
    expect(line).toMatchObject({ action: 'notify.set', detail: { format: 'slack', host: 'hooks.example.com' } });
    expect(auditText()).not.toContain(TOKEN);
  });
});

describe('notify admin: test send (#191)', () => {
  it('posts the fixed test alert to the webhook and answers ok and status only', async () => {
    const hook = await receiver(200);
    const port = await serve();
    await call(port, 'PUT', '/api/hub/admin/notify', { url: `http://127.0.0.1:${hook.port}/${TOKEN}`, format: 'json' });
    const r = await call(port, 'POST', '/api/hub/admin/notify/test', {});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, status: 200 });
    expect(hook.bodies.length).toBe(1);
    expect(hook.bodies[0]).toContain('Test from Flow Tower hub');
    expect(r.text).not.toContain(TOKEN);
    expect(auditText()).not.toContain(TOKEN);
    expect(readAudit(home, 1)[0]).toMatchObject({ action: 'notify.test', detail: { ok: true } });
  });

  it('sends the test alert with rule test, so a json receiver can tell it from a real alert (#211)', async () => {
    const hook = await receiver(200);
    const port = await serve();
    await call(port, 'PUT', '/api/hub/admin/notify', { url: `http://127.0.0.1:${hook.port}/${TOKEN}`, format: 'json' });
    await call(port, 'POST', '/api/hub/admin/notify/test', {});
    const sent = JSON.parse(hook.bodies[0]) as { alert: { id: string; rule: string } };
    expect(sent.alert.rule).toBe('test');
    expect(sent.alert.id).toBe('test:hub:hub');
  });

  it('reports a receiver that refuses, without echoing the url', async () => {
    const hook = await receiver(500);
    const port = await serve();
    await call(port, 'PUT', '/api/hub/admin/notify', { url: `http://127.0.0.1:${hook.port}/${TOKEN}`, format: 'ntfy' });
    const r = await call(port, 'POST', '/api/hub/admin/notify/test', {});
    expect(r.body).toEqual({ ok: false, status: 500 });
    expect(r.text).not.toContain(TOKEN);
  });

  it('refuses a test with no webhook set (409)', async () => {
    await call(await serve(), 'DELETE', '/api/hub/admin/notify');
    expect((await call(await serve(), 'POST', '/api/hub/admin/notify/test', {})).status).toBe(409);
  });
});

describe('thresholds route (#191)', () => {
  it('saves the errors threshold within 1..1000 and refuses anything outside it', async () => {
    const port = await serve();
    expect((await call(port, 'PUT', '/api/hub/admin/thresholds', { errors: 5 })).status).toBe(204);
    expect(readUserConfig(home).alertThresholds).toEqual({ errors: 5 });
    expect((await call(port, 'PUT', '/api/hub/admin/thresholds', { errors: 0 })).status).toBe(400);
    expect((await call(port, 'PUT', '/api/hub/admin/thresholds', { errors: 1001 })).status).toBe(400);
  });
});

describe('webhook url check in the admin model (#191)', () => {
  it('treats the loopback hosts as loopback and nothing else', () => {
    expect(isLoopbackUrl('http://127.0.0.1:8080/x')).toBe(true);
    expect(isLoopbackUrl('http://localhost/x')).toBe(true);
    expect(isLoopbackUrl('http://[::1]/x')).toBe(true);
    expect(isLoopbackUrl('http://10.0.0.1/x')).toBe(false);
    expect(isLoopbackUrl('not a url')).toBe(false);
  });

  it('accepts http only to loopback, and any https', () => {
    expect(notifyUrlValid('http://127.0.0.1')).toBe(true);
    expect(notifyUrlValid('http://localhost')).toBe(true);
    expect(notifyUrlValid('http://[::1]')).toBe(true);
    expect(notifyUrlValid('http://10.0.0.1')).toBe(false);
    expect(notifyUrlValid('https://x')).toBe(true);
    expect(notifyUrlValid('ftp://x')).toBe(false);
  });
});
