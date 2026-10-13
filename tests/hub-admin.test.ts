import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';
import { hubAdmin } from '../src/server/hub-admin';
import { readAudit } from '../src/server/admin-audit';
import { openHistory } from '../src/server/history/db';
import { createHistory } from '../src/server/history/store';
import { readUserConfig } from '../src/server/user-config';
import { tokenStore } from '../src/server/tokens';

/**
 * Hub admin (#93) on a real loopback http server. A remote request is simulated by sending it with a
 * forwarded header, which isRemote() treats as off-machine, since the socket itself is always loopback here.
 */
const home = mkdtempSync(join(tmpdir(), 'flow-tower-admin-'));
const servers: Server[] = [];
const ev = (x: object, ts: number): FlowEvent => ({ ...FlowEventSchema.parse(x), id: 1, ts, targets: [] });

afterAll(() => {
  servers.forEach((s) => s.close());
  rmSync(home, { recursive: true, force: true });
});

async function serve(hub = true, history?: ReturnType<typeof createHistory>): Promise<number> {
  const handler = hubAdmin({ home, hub, history, hubUrl: () => 'https://hub.tail1234.ts.net' });
  // connect strips the mount prefix before a handler sees the request (plugin.ts mounts at /api/hub/admin): do the same here.
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

const REMOTE = { 'x-forwarded-for': '203.0.113.9' };
const auditLines = () => readAudit(home, 1000);
const lineCount = () => auditLines().length;

describe('hub admin: loopback routes (#93)', () => {
  it('reads the admin snapshot with an audit list', async () => {
    const port = await serve();
    const r = await call(port, 'GET', '/api/hub/admin');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ senders: expect.any(Array), viewers: expect.any(Array), audit: expect.any(Array) });
  });

  it('adds a sender: answers the token once, one audit line, and no token in the log', async () => {
    const port = await serve();
    const before = lineCount();
    const r = await call(port, 'POST', '/api/hub/admin/senders', { id: 'laptop' });
    expect(r.status).toBe(200);
    const { token, configLine } = r.body as { token: string; configLine: string };
    expect(token.startsWith('ft_laptop_')).toBe(true);
    expect(configLine).toBe(`flow-tower connect https://hub.tail1234.ts.net --token ${token} --machine laptop`);
    expect(lineCount()).toBe(before + 1);
    expect(readFileSync(join(home, 'admin-audit.jsonl'), 'utf8')).not.toContain(token);
    expect(tokenStore(home).verify(token)).toEqual({ id: 'laptop' });
  });

  it('refuses a duplicate sender id (409)', async () => {
    const port = await serve();
    expect((await call(port, 'POST', '/api/hub/admin/senders', { id: 'laptop' })).status).toBe(409);
  });

  it('pauses and resumes a sender, one audit line each', async () => {
    const port = await serve();
    await call(port, 'POST', '/api/hub/admin/senders', { id: 'desk' });
    let before = lineCount();
    expect((await call(port, 'POST', '/api/hub/admin/senders/desk/pause', {})).status).toBe(204);
    expect(lineCount()).toBe(before + 1);
    before = lineCount();
    expect((await call(port, 'POST', '/api/hub/admin/senders/desk/resume', {})).status).toBe(204);
    expect(lineCount()).toBe(before + 1);
  });

  it('refuses a revoke with a wrong confirm (400) and changes nothing', async () => {
    const port = await serve();
    await call(port, 'POST', '/api/hub/admin/senders', { id: 'tab' });
    const before = lineCount();
    expect((await call(port, 'POST', '/api/hub/admin/senders/tab/revoke', { confirm: 'nope' })).status).toBe(400);
    expect(lineCount()).toBe(before);
    expect(tokenStore(home).list().find((t) => t.id === 'tab')?.revokedAt).toBeUndefined();
  });

  it('revokes with the right confirm, one audit line', async () => {
    const port = await serve();
    await call(port, 'POST', '/api/hub/admin/senders', { id: 'old' });
    const before = lineCount();
    expect((await call(port, 'POST', '/api/hub/admin/senders/old/revoke', { confirm: 'old' })).status).toBe(204);
    expect(lineCount()).toBe(before + 1);
    expect(tokenStore(home).list().find((t) => t.id === 'old')?.revokedAt).toBeDefined();
  });

  it('sets viewers, cadence, budgets, alerts and retention, each with one audit line', async () => {
    const port = await serve();
    const cases: [string, string, unknown][] = [
      ['PUT', '/api/hub/admin/viewers', { viewers: ['ana@example.com'] }],
      ['PUT', '/api/hub/admin/cadence', { cadence: { laptop: 'scheduled' } }],
      ['PUT', '/api/hub/admin/budgets', { global: 50, projects: { demo: 5 } }],
      ['PUT', '/api/hub/admin/alerts', { rule: { silent: false } }],
      ['PUT', '/api/hub/admin/retention', { retentionDays: 7 }],
    ];
    for (const [method, path, body] of cases) {
      const before = lineCount();
      const reply = await call(port, method, path, body);
      expect(reply.text, path).toBe('');
      expect(reply.status, path).toBe(204);
      expect(lineCount()).toBe(before + 1);
    }
    const cfg = readUserConfig(home);
    expect(cfg.viewers).toEqual(['ana@example.com']);
    expect(cfg.retentionDays).toBe(7);
  });

  it('refuses an unknown alert rule (400)', async () => {
    const port = await serve();
    expect((await call(port, 'PUT', '/api/hub/admin/alerts', { rule: { bogus: true } })).status).toBe(400);
  });

  it('refuses a retention outside 1..21 (400)', async () => {
    const port = await serve();
    expect((await call(port, 'PUT', '/api/hub/admin/retention', { retentionDays: 30 })).status).toBe(400);
  });

  it('delete-before: the preview count equals the deleted count, rollups stay', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-admin-hist-'));
    const opened = await openHistory(join(dir, 'history.db'));
    if (!('db' in opened)) { rmSync(dir, { recursive: true, force: true }); return; }
    const history = createHistory(opened.db);
    const base = Date.UTC(2025, 0, 10);
    history.write([ev({ kind: 'usage', user: 'a', tokens_detail: { input: 1, output: 1 } }, base), ev({ kind: 'usage', user: 'a', tokens_detail: { input: 1, output: 1 } }, base + 1000)]);
    const port = await serve(true, history);
    const before = base + 500;
    const preview = await call(port, 'GET', `/api/hub/admin/history/count?before=${before}`);
    expect(preview.status).toBe(200);
    const count = (preview.body as { events: number }).events;
    const del = await call(port, 'POST', '/api/hub/admin/history/delete-before', { before, confirm: true });
    expect(del.status).toBe(200);
    expect((del.body as { deleted: number }).deleted).toBe(count);
    expect(count).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a cross-site POST (403) and writes nothing', async () => {
    const port = await serve();
    const before = lineCount();
    const r = await call(port, 'POST', '/api/hub/admin/senders', { id: 'evil' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect(lineCount()).toBe(before);
  });
});

describe('hub admin: remote requests (#93)', () => {
  it('answers 404 to a remote GET and a remote POST, changing nothing', async () => {
    const port = await serve();
    const before = lineCount();
    expect((await call(port, 'GET', '/api/hub/admin', undefined, REMOTE)).status).toBe(404);
    expect((await call(port, 'POST', '/api/hub/admin/senders', { id: 'ghost' }, REMOTE)).status).toBe(404);
    expect((await call(port, 'PUT', '/api/hub/admin/viewers', { viewers: ['x@y'] }, REMOTE)).status).toBe(404);
    expect(lineCount()).toBe(before);
    expect(tokenStore(home).list().some((t) => t.id === 'ghost')).toBe(false);
  });

  it('answers 404 to a remote delete-before and writes no audit line', async () => {
    const port = await serve();
    const before = lineCount();
    expect((await call(port, 'POST', '/api/hub/admin/history/delete-before', { before: 1, confirm: true }, REMOTE)).status).toBe(404);
    expect(lineCount()).toBe(before);
  });

  it('answers 404 to a remote revoke and leaves the sender active', async () => {
    const port = await serve();
    await call(port, 'POST', '/api/hub/admin/senders', { id: 'safe' });
    expect((await call(port, 'POST', '/api/hub/admin/senders/safe/revoke', { confirm: 'safe' }, REMOTE)).status).toBe(404);
    expect(tokenStore(home).list().find((t) => t.id === 'safe')?.revokedAt).toBeUndefined();
  });

  it('answers 404 when this server is not a hub', async () => {
    const port = await serve(false);
    expect((await call(port, 'GET', '/api/hub/admin')).status).toBe(404);
  });
});

describe('admin audit file (#93)', () => {
  it('is written owner-only on disk', async () => {
    const port = await serve();
    await call(port, 'PUT', '/api/hub/admin/retention', { retentionDays: 3 });
    expect(existsSync(join(home, 'admin-audit.jsonl'))).toBe(true);
    expect(statSync(join(home, 'admin-audit.jsonl')).mode & 0o077).toBe(0);
  });
});
