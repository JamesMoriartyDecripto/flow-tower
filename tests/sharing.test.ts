import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sharingHandler } from '../src/server/sharing';
import { createRelay } from '../src/server/relay';

/**
 * Sharing controls on a satellite (#91). The stub hub, the temp config home and the http server all live
 * on this machine: nothing here touches the real user folder or the network beyond loopback.
 */
const homes: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  servers.splice(0).forEach((s) => s.close());
  homes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true }));
});

const tempHome = () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-sharing-'));
  homes.push(home);
  return home;
};

/** A stub hub accepting every batch, capturing bodies. */
async function stubHub() {
  const seen: { path?: string; body: unknown }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      res.statusCode = 204;
      res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>;
type Mount = [prefix: string, handler: Handler];

/**
 * The connect mounting rule plugin.ts relies on: `use(prefix, fn)` matches by PREFIX and strips it from
 * req.url, so a handler mounted at `/api/sharing` also receives `/api/sharing/test` (as `/test`). This
 * router reproduces that exactly, so a test can prove the two sharing routes cannot shadow each other.
 */
function connectLike(stack: Mount[], req: IncomingMessage, res: ServerResponse): void {
  let i = 0;
  const next = () => {
    const layer = stack[i++];
    if (!layer) {
      // connect's final handler: no route answered, so the request ends here instead of hanging.
      res.statusCode = 404;
      res.end();
      return;
    }
    const [prefix, handler] = layer;
    const url = req.url ?? '';
    const matches = url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
    if (!matches) return next();
    req.url = url.slice(prefix.length) || '/';
    return handler(req, res, next);
  };
  next();
}

/** The handler behind a real server, mounted the way plugin.ts mounts it, so shadowing is exercised too. */
async function start(hub: string, home: string, over: { hub?: boolean } = {}) {
  const relay = createRelay({ url: hub, token: 'ft_test_secret' });
  const sharing = sharingHandler({ home, relay, hub: over.hub ?? false });
  const server = createServer((req: IncomingMessage, res: ServerResponse) => connectLike([['/api/sharing/test', sharing.test], ['/api/sharing', sharing.control]], req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sharing`, relay };
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('sharing controls on a satellite (#91)', () => {
  it('pauses on request, persists it in the user folder config, and keeps every other key', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const home = tempHome();
    writeFileSync(join(home, 'config.json'), `{
  // the user's own keys must survive the switch
  "viewers": ["alice@example.com"],
  "retentionDays": 7
}
`, { mode: 0o600 });
    const { url, relay } = await start(hub.url, home);

    const on = await post(url, { paused: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({ state: 'paused' });

    const file = join(home, 'config.json');
    const written = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(written).toMatchObject({ paused: true, viewers: ['alice@example.com'], retentionDays: 7 });
    // It may hold a token: owner only, like the file connect writes.
    expect(statSync(file).mode & 0o777).toBe(0o600);

    const off = await post(url, { paused: false });
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ state: 'online' });
    expect(relay.state().state).toBe('online');
    expect((JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>).paused).toBe(false);
    relay.stop();
  });

  it('refuses a cross-site request, a remote request and a body that is not JSON', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const home = tempHome();
    const { url, relay } = await start(hub.url, home);

    expect((await post(url, { paused: true }, { Origin: 'http://localhost:3000' })).status).toBe(403);
    expect((await post(url, { paused: true }, { 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
    expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;x=application/json' }, body: JSON.stringify({ paused: true }) })).status).toBe(415);
    expect(relay.state().state).toBe('online'); // nothing was flipped
    relay.stop();
  });

  it('refuses a request the hub would call remote', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const home = tempHome();
    // Hub mode: a proxied request (any x-forwarded-for) counts as remote and must not flip the switch.
    const { url, relay } = await start(hub.url, home, { hub: true });
    expect((await post(url, { paused: true }, { 'X-Forwarded-For': '10.0.0.9' })).status).toBe(403);
    expect(relay.state().state).toBe('online');
    // A remote viewer's page polls the state: a quiet 'off', never this relay's state, never a 403 (#166).
    const read = await fetch(url, { headers: { 'X-Forwarded-For': '10.0.0.9' } });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ state: 'off' });
    relay.stop();
  });

  it('answers 404 { state: off } when there is no relay', { timeout: 5_000 }, async () => {
    const home = tempHome();
    const sharing = sharingHandler({ home, relay: undefined, hub: false });
    const server = createServer((req: IncomingMessage, res: ServerResponse) => connectLike([['/api/sharing/test', sharing.test], ['/api/sharing', sharing.control]], req, res));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sharing`;

    expect(await (await post(url, { paused: true })).json()).toMatchObject({ state: 'off' });
    expect((await fetch(url)).status).toBe(200);
  });

  it('refuses an oversize body with 413 instead of buffering it', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const home = tempHome();
    const { url, relay } = await start(hub.url, home);

    // The pause body is `{ paused }` at most: a multi-MB POST must not be buffered whole.
    const huge = JSON.stringify({ paused: true, pad: 'x'.repeat(64 * 1024) });
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: huge });
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ error: 'body too large' });
    expect(relay.state().state).toBe('online'); // nothing was flipped

    // A body just under the cap still works, so the cap is not accidentally the whole endpoint.
    const ok = await post(url, { paused: true });
    expect(ok.status).toBe(200);
    relay.stop();
  });

  it('pushes one test event to the hub and answers the state with what left the machine', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const home = tempHome();
    const { url, relay } = await start(hub.url, home);

    const r = await post(`${url}/test`, {});
    expect(r.status).toBe(200);
    const state = (await r.json()) as { state: string; lastPayload: Record<string, unknown> };
    expect(state.state).toBe('online');
    expect(state.lastPayload).toMatchObject({ kind: 'log', source: 'flow-tower', status: 'ok' });

    const sent = hub.seen.filter((s) => s.path === '/api/events');
    expect(sent).toHaveLength(1);
    const [wire] = sent[0].body as Record<string, unknown>[];
    // The probe tags the hub and carries no local content, and never the token.
    expect(wire).toMatchObject({ kind: 'log', source: 'flow-tower', status: 'ok' });
    for (const omitted of ['message', 'data', 'node', 'tool']) expect(wire).not.toHaveProperty(omitted);
    expect(JSON.stringify(state)).not.toContain('ft_test_secret');
    relay.stop();
  });

  // Regression (#91): connect matches a mount by prefix, so `/api/sharing` also received `/api/sharing/test`
  // and answered it as a pause request (400 "expected { paused: boolean }"). The two routes must stay apart.
  it('routes /api/sharing/test to the test handler and /api/sharing to the control handler', { timeout: 5_000 }, async () => {
    const hub = await stubHub();
    const home = tempHome();
    const { url, relay } = await start(hub.url, home);

    // A pause body sent to the test route must not be read as the control: the test route sends a probe.
    const test = await post(`${url}/test`, { paused: true });
    expect(test.status).toBe(200);
    expect((await test.json()) as { state: string }).toMatchObject({ state: 'online' });
    expect(hub.seen.filter((s) => s.path === '/api/events')).toHaveLength(1);
    expect(relay.state().state).toBe('online');

    // The control route itself still pauses, and writes nothing to the hub.
    const control = await post(url, { paused: true });
    expect(control.status).toBe(200);
    expect(await control.json()).toMatchObject({ state: 'paused' });
    relay.stop();
  });
});
