import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';
import { alertInput } from '../src/server/alert-inputs';
import { hubAlerts } from '../src/server/hub-alerts';
import { readAlertState, writeAlertState } from '../src/server/alerts-state';
import { openHistory } from '../src/server/history/db';
import { createHistory } from '../src/server/history/store';
import { createSatellites } from '../src/server/satellites';
import { tokenStore } from '../src/server/tokens';
import { ConfigSchema, type Config } from '../src/server/config';
import type { MachineRow } from '../src/server/machines';

/**
 * Hub alerts (#94). History is a real temp sqlite file, standing in for userHome()/history.db, and the clock is
 * a fixed number, so every rule is judged on the same "now". Node without node:sqlite skips the DB cases.
 */
const homes: string[] = [];
afterEach(() => homes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true })));
const tempHome = () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-alerts-'));
  homes.push(home);
  return home;
};

const NOW = Date.UTC(2025, 5, 15, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ev = (x: object, ts: number): FlowEvent => ({ ...FlowEventSchema.parse(x), id: 1, ts, targets: [] });

const row = (sender: string, extra: Partial<MachineRow> = {}): MachineRow => ({
  sender, token: '', state: 'active', online: false, ...extra,
});

const config = (extra: Partial<Config> = {}): Config => ConfigSchema.parse(extra);

async function openDb(): Promise<DatabaseSync | undefined> {
  const dir = tempHome();
  const res = await openHistory(join(dir, 'history.db'));
  return 'db' in res ? res.db : undefined;
}

describe('alert inputs from history (#94)', () => {
  it('builds zero costs and empty lists when there is no history DB', () => {
    const input = alertInput(undefined, [row('dana', { lastSeen: NOW })], config(), NOW);
    expect(input.monthCost).toEqual({ global: 0, projects: {} });
    expect(input.errorsByHour).toEqual([]);
    expect(input.newHosts).toEqual([]);
    expect(input.machines).toEqual([{ id: 'dana', lastSeen: NOW, cadence: undefined }]);
  });

  it('sums cost since the 1st of the current UTC month, global and per project', async () => {
    const db = await openDb();
    if (!db) return;
    const history = createHistory(db);
    const monthStart = Date.UTC(2025, 5, 1);
    history.write([
      ev({ kind: 'usage', sender: 'dana', user: 'dana', project: 'alpha', cost_usd: 2.5 }, monthStart + HOUR),
      ev({ kind: 'usage', sender: 'dana', user: 'dana', project: 'beta', cost_usd: 1.25 }, NOW - HOUR),
      // Last month: must not count toward this month's spend.
      ev({ kind: 'usage', sender: 'dana', user: 'dana', project: 'alpha', cost_usd: 100 }, monthStart - HOUR),
    ]);
    const input = alertInput(db, [], config(), NOW);
    expect(input.monthCost.global).toBeCloseTo(3.75, 6);
    expect(input.monthCost.projects).toEqual({ alpha: 2.5, beta: 1.25 });
  });

  it('builds 169 error buckets with the current hour last and quiet hours as zero', async () => {
    const db = await openDb();
    if (!db) return;
    const history = createHistory(db);
    const currentHour = Math.floor(NOW / HOUR) * HOUR;
    history.write([
      ev({ kind: 'log', sender: 'dana', status: 'error' }, currentHour + 5 * 60_000),
      ev({ kind: 'log', sender: 'dana', status: 'error' }, currentHour + 6 * 60_000),
      ev({ kind: 'log', sender: 'dana', status: 'error' }, currentHour - 3 * HOUR + 1),
    ]);
    const { errorsByHour } = alertInput(db, [], config(), NOW);
    expect(errorsByHour).toHaveLength(169);
    expect(errorsByHour[168]).toBe(2);
    expect(errorsByHour[165]).toBe(1);
    expect(errorsByHour[0]).toBe(0);
  });

  it('reports a host as new only when its sender had an earlier host and it appeared within 24 h', async () => {
    const db = await openDb();
    if (!db) return;
    const history = createHistory(db);
    history.write([
      // alice: an old host, then a new one 2 h ago: the new one counts.
      ev({ kind: 'log', sender: 'alice', host: 'laptop' }, NOW - 10 * DAY),
      ev({ kind: 'log', sender: 'alice', host: 'desk' }, NOW - 2 * HOUR),
      // bob: only one host ever, however recent: nothing to compare against.
      ev({ kind: 'log', sender: 'bob', host: 'box' }, NOW - HOUR),
      // carol: an old host and a host from 3 days ago: outside the window.
      ev({ kind: 'log', sender: 'carol', host: 'old' }, NOW - 9 * DAY),
      ev({ kind: 'log', sender: 'carol', host: 'older-new' }, NOW - 3 * DAY),
    ]);
    const { newHosts } = alertInput(db, [], config(), NOW);
    expect(newHosts).toEqual([{ sender: 'alice', host: 'desk', firstSeen: NOW - 2 * HOUR }]);
  });

  it('keeps the cadence per sender and the budgets as the config states them', () => {
    const input = alertInput(undefined, [row('dana')], config({ cadence: { dana: 'always-on' }, budgets: { global: 50 } }), NOW);
    expect(input.machines[0]!.cadence).toBe('always-on');
    expect(input.budgets).toEqual({ global: 50 });
  });
});

describe('alert state file (#94)', () => {
  it('reads a missing file as an empty state, and drops malformed entries', () => {
    const home = tempHome();
    expect(readAlertState(home)).toEqual({ acked: {}, snoozed: {} });
    writeAlertState(home, { acked: { 'silent:machine:dana': NOW }, snoozed: {} });
    // A hand-edited file: a string time and a non-object are dropped, the good entry stays.
    writeFileJson(join(home, 'alerts-state.json'), { acked: { a: 'soon', b: NOW }, snoozed: 'nope' });
    expect(readAlertState(home)).toEqual({ acked: { b: NOW }, snoozed: {} });
  });

  it('writes 0600 with no temp file left behind', () => {
    const home = tempHome();
    writeAlertState(home, { acked: { x: NOW }, snoozed: {} });
    const file = join(home, 'alerts-state.json');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toContain('"x"');
    expect(existsSync(join(home, 'alerts-state.json.tmp'))).toBe(false);
  });
});

/** A fake req/res that captures what the handler wrote, like tests/hub-views.test.ts. */
type Req = { method: string; url: string; headers: Record<string, string>; socket: { remoteAddress: string }; body?: string };
// connect strips the mount prefix before the handler runs: a handler sees '/ack', not '/api/hub/alerts/ack'.
const loopback = (method: string, url: string, headers: Record<string, string> = {}, body?: unknown): Req => ({
  method, url, headers: { 'content-type': 'application/json', ...headers }, socket: { remoteAddress: '127.0.0.1' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const remote = (method: string, url: string, body?: unknown): Req => ({ ...loopback(method, url, {}, body), socket: { remoteAddress: '100.64.0.9' } });

/** The request as the handler reads it: the headers and socket, plus a body that streams like IncomingMessage. */
function fake(req: Req): IncomingMessage {
  const chunks = req.body === undefined ? [] : [Buffer.from(req.body)];
  return {
    method: req.method,
    url: req.url,
    headers: req.headers,
    socket: req.socket,
    async *[Symbol.asyncIterator]() { yield* chunks; },
    destroy() { /* no-op for the fake */ },
  } as unknown as IncomingMessage;
}

async function call(handler: (req: IncomingMessage, res: ServerResponse) => unknown, req: Req) {
  const sent = { status: 0, body: '' };
  const res = {
    statusCode: 0,
    writableEnded: false,
    setHeader() { /* headers do not affect these assertions */ },
    end(this: { statusCode: number; writableEnded: boolean }, body?: string) {
      sent.status = this.statusCode;
      sent.body = body ?? '';
      this.writableEnded = true;
    },
  } as unknown as ServerResponse;
  await handler(fake(req), res);
  return sent;
}

/** A satellite that has gone quiet: always-on, so the silent rule fires for it. */
function quietHub(home: string) {
  const { token } = tokenStore(home).create('dana');
  const satellites = createSatellites(() => NOW - 2 * HOUR);
  satellites.beat('dana', { queued: 0, dropped: 0, state: 'ok' });
  writeFileJson(join(home, 'config.json'), { cadence: { dana: 'always-on' } });
  return { token, satellites };
}

/** A fixture in a temp folder: plain JSON, no atomic write needed. */
const writeFileJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));

describe('hub alert routes (#94)', () => {
  it('GET returns alerts, rules and counts, and a remote viewer may read it', async () => {
    const home = tempHome();
    const { satellites } = quietHub(home);
    const handler = hubAlerts({ satellites, home, hub: true });
    const res = await call(handler, loopback('GET', '/'));

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { alerts: { id: string; level: string }[]; rules: { id: string; title: string; enabled: boolean }[]; counts: { warning: number; critical: number } };
    expect(body.alerts.map((a) => a.id)).toContain('silent:machine:dana');
    expect(body.rules.map((r) => r.id)).toEqual(['silent', 'budget', 'error-spike', 'new-host']);
    expect(body.rules.every((r) => r.enabled)).toBe(true);
    expect(body.counts.warning + body.counts.critical).toBe(body.alerts.length);
  });

  it('acks from loopback with 204 and persists the ack', async () => {
    const home = tempHome();
    const { satellites } = quietHub(home);
    const handler = hubAlerts({ satellites, home, hub: true });
    const res = await call(handler, loopback('POST', '/ack', {}, { id: 'silent:machine:dana' }));

    expect(res.status).toBe(204);
    expect(Object.keys(readAlertState(home).acked)).toEqual(['silent:machine:dana']);
  });

  it('snoozes from loopback with 204 and persists the time for 1h or 1d', async () => {
    const home = tempHome();
    const { satellites } = quietHub(home);
    const handler = hubAlerts({ satellites, home, hub: true });
    expect((await call(handler, loopback('POST', '/snooze', {}, { id: 'silent:machine:dana', for: '1h' }))).status).toBe(204);
    const state = readAlertState(home);
    expect(state.snoozed['silent:machine:dana']).toBeGreaterThan(Date.now());
    expect(state.snoozed['silent:machine:dana']! - Date.now()).toBeLessThanOrEqual(HOUR + 1000);
  });

  it('refuses a snooze for an unknown duration with 400', async () => {
    const home = tempHome();
    const { satellites } = quietHub(home);
    const handler = hubAlerts({ satellites, home, hub: true });
    expect((await call(handler, loopback('POST', '/snooze', {}, { id: 'silent:machine:dana', for: '1w' }))).status).toBe(400);
  });

  it('answers 404 to an ack or snooze from a remote address, and stores nothing', async () => {
    const home = tempHome();
    const { satellites } = quietHub(home);
    const handler = hubAlerts({ satellites, home, hub: true });
    expect((await call(handler, remote('POST', '/ack', { id: 'silent:machine:dana' }))).status).toBe(404);
    expect((await call(handler, remote('POST', '/snooze', { id: 'silent:machine:dana', for: '1h' }))).status).toBe(404);
    expect(readAlertState(home)).toEqual({ acked: {}, snoozed: {} });
  });

  it('refuses a cross-site ack with 403', async () => {
    const home = tempHome();
    const { satellites } = quietHub(home);
    const handler = hubAlerts({ satellites, home, hub: true });
    const req = loopback('POST', '/ack', { origin: 'http://evil.example' }, { id: 'silent:machine:dana' });
    expect((await call(handler, req)).status).toBe(403);
  });

  it('does not ack an alert that is not firing', async () => {
    const home = tempHome();
    const { satellites } = quietHub(home);
    const handler = hubAlerts({ satellites, home, hub: true });
    expect((await call(handler, loopback('POST', '/ack', {}, { id: 'silent:machine:ghost' }))).status).toBe(404);
  });
});
