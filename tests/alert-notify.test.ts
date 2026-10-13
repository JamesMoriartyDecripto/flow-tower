import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Alert } from '../src/server/alerts';
import { formatMessage, sendNotification, type FetchLike } from '../src/server/alert-notify';
import { createAlertNotifier } from '../src/server/hub-alerts';
import { readAlertState, updateAlertState, writeAlertState } from '../src/server/alerts-state';
import { openHistory } from '../src/server/history/db';
import type { Satellites } from '../src/server/satellites';

const alert: Alert = {
  id: 'errors:machine:dana',
  rule: 'errors',
  level: 'warning',
  subject: { kind: 'machine', name: 'dana' },
  message: 'dana: 4 errors in the last 15 min',
};
const critical: Alert = { ...alert, level: 'critical' };
const MINUTE = 60_000;
const NO_SATELLITES = { list: () => [] } as unknown as Satellites;

describe('formatMessage', () => {
  it('json carries only the alert fields and the hub name', () => {
    const { headers, body } = formatMessage(alert, 'open', 'json', 'hub-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(body)).toEqual({
      event: 'open',
      alert: { id: alert.id, rule: 'errors', level: 'warning', subject: alert.subject, message: alert.message },
      hub: 'hub-1',
    });
  });

  it('slack and telegram send { text } with the open and clear wording', () => {
    expect(JSON.parse(formatMessage(alert, 'open', 'slack').body)).toEqual({ text: `⚠ ${alert.message}` });
    expect(JSON.parse(formatMessage(alert, 'clear', 'telegram').body)).toEqual({ text: `✓ cleared: ${alert.message}` });
  });

  it('ntfy is plain text with Title and Priority, high only for critical', () => {
    const warn = formatMessage(alert, 'open', 'ntfy');
    expect(warn.body).toBe(`⚠ ${alert.message}`);
    expect(warn.headers.Priority).toBe('default');
    expect(warn.headers.Title).toBeTruthy();
    expect(formatMessage(critical, 'open', 'ntfy').headers.Priority).toBe('high');
  });
});

describe('sendNotification', () => {
  const notify = { url: 'https://hooks.example.test/secret-token-abc', format: 'json' as const };
  const payload = formatMessage(alert, 'open', 'json');

  it('reports ok on a 2xx answer', async () => {
    const fetchFn: FetchLike = async () => ({ status: 204 });
    expect(await sendNotification(notify, payload, fetchFn)).toEqual({ ok: true, status: 204 });
  });

  it('never leaks the url in an error, even when fetch throws with it in the message', async () => {
    const fetchFn: FetchLike = async () => { throw new TypeError(`fetch failed for ${notify.url}`); };
    const res = await sendNotification(notify, payload, fetchFn);
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('secret-token-abc');
  });

  it('reports a non-2xx status without the url', async () => {
    const fetchFn: FetchLike = async () => ({ status: 500 });
    expect(await sendNotification(notify, payload, fetchFn)).toEqual({ ok: false, status: 500, error: 'http 500' });
  });
});

describe('notifier: a local receiver, a real history DB and a fake clock', () => {
  let server: Server;
  let url: string;
  let received: { headers: IncomingMessage['headers']; body: string }[];
  let home: string;
  let db: DatabaseSync;
  let clock: number;
  const NOW = Date.UTC(2025, 5, 10, 12, 0, 0);
  let eventN = 0;

  beforeEach(async () => {
    received = [];
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
      req.on('end', () => { received.push({ headers: req.headers, body }); res.statusCode = 204; res.end(); });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/hook`;
    home = mkdtempSync(join(tmpdir(), 'flow-tower-notify-'));
    const opened = await openHistory(join(mkdtempSync(join(tmpdir(), 'flow-tower-notify-db-')), 'history.db'));
    if (!('db' in opened)) throw new Error('node:sqlite is needed for these tests');
    db = opened.db;
    clock = NOW;
  });

  afterEach(async () => {
    db.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  const writeConfig = (notify?: { url: string; format: 'json' | 'slack' | 'telegram' | 'ntfy' }) => {
    writeFileSync(join(home, 'config.json'), JSON.stringify(notify ? { notify } : {}), { mode: 0o600 });
  };

  /** Four error rows for dana, stamped `ago` ms before the clock, so the errors rule fires on them. */
  const addErrors = (ago: number, sender = 'dana', n = 4) => {
    for (let i = 0; i < n; i += 1) {
      eventN += 1;
      db.prepare('INSERT INTO events (ts, sender, status, event_key) VALUES (?, ?, ?, ?)').run(clock - ago, sender, 'error', `e${eventN}`);
    }
  };

  const notifier = () => createAlertNotifier({ satellites: NO_SATELLITES, home, db, now: () => clock });

  it('with no notify configured, sends nothing and keeps notified empty', async () => {
    writeConfig();
    addErrors(MINUTE);
    await notifier().tick();
    expect(received).toHaveLength(0);
    expect(readAlertState(home).notified ?? {}).toEqual({});
  });

  it('a firing alert gets one open, then one clear once it stops firing, across ticks', async () => {
    writeConfig({ url, format: 'json' });
    addErrors(MINUTE);
    const n = notifier();

    await n.tick();
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!.body)).toMatchObject({ event: 'open', alert: { id: 'errors:machine:dana' } });
    expect(readAlertState(home).notified).toEqual({ 'errors:machine:dana': NOW });

    // Still firing on the next tick: no second open.
    clock += MINUTE;
    await n.tick();
    expect(received).toHaveLength(1);

    // Sixteen minutes on, the errors have left the 15-minute window: the alert clears, once.
    clock += 15 * MINUTE;
    await n.tick();
    expect(received).toHaveLength(2);
    expect(JSON.parse(received[1]!.body)).toMatchObject({ event: 'clear', alert: { id: 'errors:machine:dana' } });
    expect(readAlertState(home).notified).toEqual({});

    await n.tick();
    expect(received).toHaveLength(2);
  });

  it('the posted body and headers reach the receiver', async () => {
    writeConfig({ url, format: 'ntfy' });
    addErrors(MINUTE, 'dana', 5);
    await notifier().tick();
    expect(received).toHaveLength(1);
    expect(received[0]!.body).toBe('⚠ dana: 5 errors in the last 15 min');
    expect(received[0]!.headers.title).toBe('Flow Tower alert');
    expect(received[0]!.headers.priority).toBe('default');
  });

  it('an acked alert gets no open', async () => {
    writeConfig({ url, format: 'slack' });
    addErrors(MINUTE);
    writeAlertState(home, { acked: { 'errors:machine:dana': NOW }, snoozed: {} });
    await notifier().tick();
    expect(received).toHaveLength(0);
  });

  it('a snoozed alert gets no open until the snooze ends', async () => {
    writeConfig({ url, format: 'slack' });
    addErrors(MINUTE);
    writeAlertState(home, { acked: {}, snoozed: { 'errors:machine:dana': NOW + MINUTE } });
    const n = notifier();
    await n.tick();
    expect(received).toHaveLength(0);
    clock += 2 * MINUTE;
    await n.tick();
    expect(received).toHaveLength(1);
  });

  it('a failed send is not recorded, so the next tick tries again', async () => {
    writeConfig({ url: 'https://hooks.example.test/x', format: 'json' });
    addErrors(MINUTE);
    let fail = true;
    const sent: string[] = [];
    const n = createAlertNotifier({
      satellites: NO_SATELLITES, home, db, now: () => clock,
      fetch: async (_u, init) => { sent.push(init.body); return { status: fail ? 500 : 204 }; },
    });
    await n.tick();
    expect(readAlertState(home).notified ?? {}).toEqual({});
    fail = false;
    await n.tick();
    expect(sent).toHaveLength(2);
    expect(readAlertState(home).notified).toEqual({ 'errors:machine:dana': NOW });
  });
});

describe('notifier: the rate limit', () => {
  it('sends at most 10 per 10 minutes and resumes after the window', async () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-notify-rate-'));
    writeFileSync(join(home, 'config.json'), JSON.stringify({ notify: { url: 'https://hooks.example.test/x', format: 'ntfy' } }), { mode: 0o600 });
    let clock = Date.UTC(2025, 5, 10, 12, 0, 0);
    let sends = 0;
    // Twelve alerts were notified and have all stopped firing: twelve clears are owed, and only ten may go out.
    const ids = Array.from({ length: 12 }, (_, i) => `errors:machine:m${i}`);
    writeAlertState(home, { acked: {}, snoozed: {}, notified: Object.fromEntries(ids.map((id) => [id, clock - 1])) });
    const n = createAlertNotifier({
      satellites: NO_SATELLITES, home, db: undefined, now: () => clock,
      fetch: async () => { sends += 1; return { status: 200 }; },
    });
    await n.tick();
    expect(sends).toBe(10);
    expect(Object.keys(readAlertState(home).notified ?? {})).toHaveLength(2);
    clock += 10 * MINUTE + 1;
    await n.tick();
    expect(sends).toBe(12);
    expect(readAlertState(home).notified).toEqual({});
  });
});

describe('notifier: review fixes (#191)', () => {
  let receiver: Server;
  let receiverHits: number;
  let receiverPort: number;

  beforeEach(async () => {
    receiverHits = 0;
    receiver = createServer((_req, res) => { receiverHits += 1; res.statusCode = 204; res.end(); });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', () => r()));
    receiverPort = (receiver.address() as { port: number }).port;
  });

  afterEach(async () => {
    await new Promise<void>((r) => receiver.close(() => r()));
  });

  it('a 302 from the webhook is refused and the redirect target is never requested', async () => {
    // A real redirector on loopback: if fetch followed the 302, the second server would see a hit.
    const bounce = createServer((_req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://127.0.0.1:${receiverPort}/elsewhere`);
      res.end();
    });
    await new Promise<void>((r) => bounce.listen(0, '127.0.0.1', () => r()));
    try {
      const port = (bounce.address() as { port: number }).port;
      const res = await sendNotification({ url: `http://127.0.0.1:${port}/hook`, format: 'json' }, formatMessage(alert, 'open', 'json'));
      expect(res).toEqual({ ok: false, error: 'redirect refused' });
      expect(receiverHits).toBe(0);
    } finally {
      await new Promise<void>((r) => bounce.close(() => r()));
    }
  });

  it('an ack written between two ticks does not cause a second open', async () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-notify-ack-'));
    const db = (await openHistory(join(mkdtempSync(join(tmpdir(), 'flow-tower-notify-ackdb-')), 'history.db')));
    if (!('db' in db)) throw new Error('node:sqlite is needed for these tests');
    writeFileSync(join(home, 'config.json'), JSON.stringify({ notify: { url: 'https://hooks.example.test/x', format: 'json' } }), { mode: 0o600 });
    const clock = { t: Date.UTC(2025, 5, 10, 12, 0, 0) };
    for (let i = 0; i < 4; i += 1) {
      db.db.prepare('INSERT INTO events (ts, sender, status, event_key) VALUES (?, ?, ?, ?)').run(clock.t - MINUTE, 'dana', 'error', `ack${i}`);
    }
    let sends = 0;
    const n = createAlertNotifier({
      satellites: NO_SATELLITES, home, db: db.db, now: () => clock.t,
      fetch: async () => { sends += 1; return { status: 204 }; },
    });
    await n.tick();
    expect(sends).toBe(1);
    // The ack route writes the acked entry; it must keep the ticker's `notified` entry intact.
    updateAlertState(home, (cur) => ({ ...cur, acked: { ...cur.acked, 'errors:machine:dana': clock.t } }));
    clock.t += MINUTE;
    await n.tick();
    expect(sends).toBe(1);
    // The entry is still firing, so its time is the last tick that saw it, not the first send.
    expect(readAlertState(home).notified).toEqual({ 'errors:machine:dana': clock.t });
    db.db.close();
  });

  it('a notified entry not seen firing for 24 h is pruned, even when its clear keeps failing', async () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-notify-prune-'));
    writeFileSync(join(home, 'config.json'), JSON.stringify({ notify: { url: 'https://hooks.example.test/x', format: 'json' } }), { mode: 0o600 });
    const clock = Date.UTC(2025, 5, 10, 12, 0, 0);
    writeAlertState(home, {
      acked: {}, snoozed: {},
      notified: { 'errors:machine:old': clock - 25 * 60 * MINUTE, 'errors:machine:recent': clock - 23 * 60 * MINUTE },
    });
    let sends = 0;
    const n = createAlertNotifier({
      satellites: NO_SATELLITES, home, db: undefined, now: () => clock,
      fetch: async () => { sends += 1; return { status: 500 }; },
    });
    await n.tick();
    // The old entry is dropped without another send; the recent one still owes its clear, which failed.
    expect(readAlertState(home).notified).toEqual({ 'errors:machine:recent': clock - 23 * 60 * MINUTE });
    expect(sends).toBe(1);
  });

  it('a failing webhook does not consume the rate budget for healthy sends', async () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-notify-budget-'));
    writeFileSync(join(home, 'config.json'), JSON.stringify({ notify: { url: 'https://hooks.example.test/x', format: 'ntfy' } }), { mode: 0o600 });
    let clock = Date.UTC(2025, 5, 10, 12, 0, 0);
    const ids = Array.from({ length: 12 }, (_, i) => `errors:machine:b${i}`);
    writeAlertState(home, { acked: {}, snoozed: {}, notified: Object.fromEntries(ids.map((id) => [id, clock - 1])) });
    let fail = true;
    let accepted = 0;
    const n = createAlertNotifier({
      satellites: NO_SATELLITES, home, db: undefined, now: () => clock,
      fetch: async () => { if (fail) return { status: 500 }; accepted += 1; return { status: 200 }; },
    });
    await n.tick();
    expect(accepted).toBe(0);
    // Ten failures in the first tick must not count against the window: the webhook recovers and the budget is whole.
    fail = false;
    clock += 1;
    await n.tick();
    expect(accepted).toBe(10);
  });

  it('a corrupt notified keeps the acks and snoozes next to it', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-notify-corrupt-'));
    for (const bad of ['null', '[]', '"text"']) {
      writeFileSync(join(home, 'alerts-state.json'), `{"acked":{"a:b:c":5},"snoozed":{"d:e:f":9},"notified":${bad}}`);
      const state = readAlertState(home);
      expect(state.acked).toEqual({ 'a:b:c': 5 });
      expect(state.snoozed).toEqual({ 'd:e:f': 9 });
      expect(state.notified).toEqual({});
    }
  });
});
