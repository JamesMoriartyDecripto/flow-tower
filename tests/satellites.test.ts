import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventHub } from '../src/server/events';
import { createSatellites, ONLINE_MS } from '../src/server/satellites';
import { hubGuard, type HubOptions } from '../src/server/hub';
import { tokenStore } from '../src/server/tokens';

const home = mkdtempSync(join(tmpdir(), 'flow-tower-sat-'));
const { token } = tokenStore(home).create('dana');
const opts: HubOptions = { hub: true, ingestOnly: false, home };

const servers: Server[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); });

/** A real hub behind the guard, so the socket decides "remote" and the token is checked for real. */
async function hubServer(satellites = createSatellites()) {
  const hub = createEventHub(() => undefined, () => undefined, { legacy: opts.legacy, home, hub: true }, { satellites });
  const server = createServer((rq, rs) => hubGuard(opts)(rq, rs, () => {
    if (rq.url?.startsWith('/api/heartbeat')) return hub.heartbeat(rq, rs);
    hub.handle(rq, rs);
  }));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // x-forwarded-for makes the request remote, exactly like tailscale serve in front of the hub.
  const beat = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '100.64.0.9', ...headers },
      body: JSON.stringify(body),
    });
  return { beat, satellites };
}

describe('satellite heartbeats (#91)', () => {
  it('refuses a heartbeat without a token in hub mode (401) and accepts one with a token (204)', { timeout: 5_000 }, async () => {
    const { beat, satellites } = await hubServer();
    const body = { queued: 3, dropped: 1, state: 'queued', version: '0.5.0' };

    expect((await beat(body)).status).toBe(401);
    const accepted = await beat(body, { 'x-flow-tower-token': token });
    expect(accepted.status).toBe(204);
    expect(await accepted.text()).toBe('');

    const [sat] = satellites.list();
    expect(sat).toMatchObject({ sender: 'dana', queued: 3, dropped: 1, state: 'queued', version: '0.5.0', online: true });
    expect(JSON.stringify(sat)).not.toContain(token);
  });

  it('rejects a malformed heartbeat with 400', { timeout: 5_000 }, async () => {
    const { beat } = await hubServer();
    const headers = { 'x-flow-tower-token': token };
    expect((await beat({ queued: 'lots', dropped: 0, state: 'online' }, headers)).status).toBe(400);
    expect((await beat({ queued: 0, dropped: 0 }, headers)).status).toBe(400);
  });

  it('reports online false once lastSeen ages past the window', () => {
    let clock = 1_000_000;
    const satellites = createSatellites(() => clock);
    satellites.beat('dana', { queued: 0, dropped: 0, state: 'online' });
    expect(satellites.list()[0].online).toBe(true);

    clock += ONLINE_MS + 1;
    expect(satellites.list()[0].online).toBe(false);
    // A fresh beat brings it back online.
    satellites.beat('dana', { queued: 0, dropped: 0, state: 'online' });
    expect(satellites.list()[0].online).toBe(true);
  });

  it('records lastEventAt from an accepted event, without a heartbeat', () => {
    const clock = 1_000_000;
    const satellites = createSatellites(() => clock);
    const hub = createEventHub(() => undefined, () => undefined, { home, hub: true }, { satellites, clock: () => clock });
    hub.ingest({ kind: 'log', ts: clock }, undefined, undefined, 'dana');

    const [sat] = satellites.list();
    expect(sat).toMatchObject({ sender: 'dana', lastEventAt: clock, online: false });
    expect(sat.lastSeen).toBeUndefined();
  });
});
