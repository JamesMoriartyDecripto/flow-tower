/**
 * The Hub's alert routes (#94). GET /api/hub/alerts is a viewing route like /api/hub/machines: a listed
 * tailnet viewer may read it. POST ack and snooze change the operator's state, so they answer only to a
 * request from this machine: a remote request gets 404, as the other mutating hub routes do. One handler
 * serves the three paths: connect matches mounts by prefix, so separate mounts would shadow each other.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { crossSite, isJson } from './guard.ts';
import { isRemote } from './auth.ts';
import { evaluateAlerts, applyAcks, pruneState, RULES, RULE_TITLES, type Alert, type AckState, type Rule } from './alerts.ts';
import { alertInput } from './alert-inputs.ts';
import { readAlertState, writeAlertState } from './alerts-state.ts';
import { machineRows } from './machines.ts';
import { tokenStore } from './tokens.ts';
import { loadConfig } from './config.ts';
import type { Satellites } from './satellites.ts';
import { formatMessage, sendNotification, type FetchLike } from './alert-notify.ts';
import { hostname } from 'node:os';

export interface HubAlertOptions {
  satellites: Satellites;
  /** The user folder: tokens.json, config.json and alerts-state.json all live here. */
  home: string;
  /** Hub mode as the caller knows it: off means this server is not a hub, so the routes do not exist. */
  hub: boolean;
  /** The history DB, or undefined when history is disabled: the silent rule still works without it. */
  db?: DatabaseSync;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The snooze durations the UI offers; anything else is refused rather than guessed at. */
const SNOOZE: Record<string, number> = { '1h': HOUR, '1d': DAY };
/** The body is one alert id and an optional duration: a few bytes. */
const MAX_BODY = 4 * 1024;

const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

/** One JSON object under MAX_BODY, or undefined after a refusal was sent. */
async function readJson(req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) { send(res, 413, { error: 'body too large' }); req.destroy(); return undefined; }
    chunks.push(chunk as Buffer);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Alert ids are `rule:kind:name`: a short printable string, nothing that could be a path or a header trick. */
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[a-z-]+:[a-z]+:[^\s]{1,200}$/.test(v);

/**
 * The alerts as the page shows them and as the notifier sees them: evaluated now, state pruned on the way.
 * One function for both, so the page and the webhook can never disagree about what is firing.
 */
export function evaluateNow({ satellites, home, db }: Pick<HubAlertOptions, 'satellites' | 'home' | 'db'>, now: number) {
  const config = loadConfig({ home }).config;
  const rows = machineRows(tokenStore(home).list(), satellites.list(), now);
  // `firing` is every alert whose condition holds, snoozed or not: an ack or snooze may only target one of these.
  const firing = evaluateAlerts(alertInput(db, rows, config, now));
  const stored = readAlertState(home);
  // Pruned before it is applied: an entry for an alert that no longer fires must not outlive its condition.
  const state = pruneState(stored, firing);
  if (JSON.stringify(state) !== JSON.stringify(stored)) writeAlertState(home, state);
  return { config, firing, state, shown: applyAcks(firing, state, now) };
}

/** The notifier looks at the alerts once a minute: a lead learns of a breach within a minute, not on the next page load. */
const NOTIFY_INTERVAL_MS = 60_000;
/**
 * At most this many webhook sends per window. A burst (a whole hub breaking at once) must not flood the
 * receiver or get the hub's address blocked; the rest wait for a later tick.
 */
const NOTIFY_MAX_SENDS = 10;
const NOTIFY_WINDOW_MS = 10 * 60_000;

export interface AlertNotifierOptions extends Pick<HubAlertOptions, 'satellites' | 'home' | 'db'> {
  now?: () => number;
  fetch?: FetchLike;
}

/**
 * The notifier's tick, without a timer: the tests drive it with a fake clock. Each tick evaluates the alerts
 * the same way the GET does, then sends an open for each new firing alert and a clear for each notified
 * alert that stopped firing. A failed send is not recorded, so the next tick tries it again.
 */
export function createAlertNotifier({ satellites, home, db, now = Date.now, fetch }: AlertNotifierOptions) {
  // A clear is sent after the alert has stopped firing, so its text comes from the open that was sent.
  const lastSent = new Map<string, Alert>();
  // Times of recent sends, oldest first, for the rate limit.
  const sentAt: number[] = [];
  let running = false;

  const sendAllowed = (at: number) => {
    while (sentAt.length && sentAt[0]! <= at - NOTIFY_WINDOW_MS) sentAt.shift();
    return sentAt.length < NOTIFY_MAX_SENDS;
  };

  /**
   * Writes the notified map into the state as it is on disk now, not as it was read at the start of the tick:
   * an ack POST may have landed in between, and it must not be overwritten.
   */
  const saveNotified = (notified: Record<string, number>) => {
    writeAlertState(home, { ...readAlertState(home), notified });
  };

  const tickOnce = async () => {
    const at = now();
    const { config, firing, state } = evaluateNow({ satellites, home, db }, at);
    const notify = config.notify;
    // No webhook configured: nothing is owed, so notified is kept empty. It is written only if it had entries.
    if (!notify) {
      if (state.notified && Object.keys(state.notified).length) saveNotified({});
      return;
    }

    const notified: Record<string, number> = { ...(state.notified ?? {}) };
    const firingIds = new Set(firing.map((a) => a.id));
    const queue: { event: 'open' | 'clear'; alert: Alert }[] = [];
    for (const id of Object.keys(notified)) {
      if (!firingIds.has(id)) queue.push({ event: 'clear', alert: lastSent.get(id) ?? fallbackAlert(id) });
    }
    for (const alert of firing) {
      // Acked or snoozed alerts stay quiet: the operator has already dealt with them.
      if (state.acked[alert.id] !== undefined || (state.snoozed[alert.id] ?? 0) > at) continue;
      if (notified[alert.id] !== undefined) continue;
      queue.push({ event: 'open', alert });
    }

    const hubName = hostname();
    let changed = false;
    for (const { event, alert } of queue) {
      if (!sendAllowed(at)) break;
      sentAt.push(at);
      const res = await sendNotification(notify, formatMessage(alert, event, notify.format, hubName), fetch);
      if (!res.ok) continue;
      changed = true;
      if (event === 'open') {
        notified[alert.id] = at;
        lastSent.set(alert.id, alert);
      } else {
        delete notified[alert.id];
        lastSent.delete(alert.id);
      }
    }
    if (changed) saveNotified(notified);
  };

  /** One tick at a time: a slow webhook must not let a second tick send the same open twice. */
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try { await tickOnce(); } finally { running = false; }
  };

  return { tick };
}

/**
 * A clear for an alert this process never sent an open for (the hub restarted since): the id names the rule
 * and subject, which is enough to say what cleared. The message is not stored, so the id stands in for it.
 */
function fallbackAlert(id: string): Alert {
  const [rule = 'silent', kind = 'machine', ...rest] = id.split(':');
  return {
    id,
    rule: rule as Rule,
    level: 'warning',
    subject: { kind: kind as Alert['subject']['kind'], name: rest.join(':') },
    message: id,
  };
}

/**
 * Runs the notifier on a timer (#191). The timer is unref'd so it never keeps the process alive alone, and
 * the caller stops it on close. A failing tick is swallowed here: the next one tries again.
 */
export function startAlertNotifier(options: AlertNotifierOptions & { intervalMs?: number }): { stop: () => void } {
  const notifier = createAlertNotifier(options);
  const timer = setInterval(() => { notifier.tick().catch(() => undefined); }, options.intervalMs ?? NOTIFY_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

export function hubAlerts({ satellites, home, hub, db }: HubAlertOptions) {
  const evaluate = (now: number) => evaluateNow({ satellites, home, db }, now);

  const list = (req: IncomingMessage, res: ServerResponse) => {
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    const { config, shown: alerts } = evaluate(Date.now());
    const enabled = config.alerts ?? {};
    const rules = RULES.map((id) => ({ id, title: RULE_TITLES[id], enabled: enabled[id] !== false }));
    const counts = {
      warning: alerts.filter((a) => a.level === 'warning').length,
      critical: alerts.filter((a) => a.level === 'critical').length,
    };
    send(res, 200, { alerts, rules, counts });
  };

  /** Ack and snooze: loopback only, a cross-site page refused, a JSON body, and 204 when stored. */
  const mutate = async (req: IncomingMessage, res: ServerResponse, sub: string) => {
    // A remote request is refused before anything is read: the operator's state is local-only.
    if (isRemote(req, { hub })) return send(res, 404, { error: 'not found' });
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readJson(req, res);
    if (res.writableEnded || body === undefined) return;
    if (!idOk(body.id)) return send(res, 400, { error: 'id must be an alert id' });
    const now = Date.now();
    // Only an alert that currently fires can be acked or snoozed: a stale or made-up id is not stored.
    const { firing, state } = evaluate(now);
    if (!firing.some((a) => a.id === body.id)) return send(res, 404, { error: 'no such alert' });
    // `notified` is carried over: a state write that dropped it would send the same open again on the next tick.
    const next: AckState = {
      acked: { ...state.acked },
      snoozed: { ...state.snoozed },
      ...(state.notified ? { notified: { ...state.notified } } : {}),
    };
    if (sub === 'ack') {
      next.acked[body.id] = now;
    } else {
      const span = typeof body.for === 'string' ? SNOOZE[body.for] : undefined;
      if (span === undefined) return send(res, 400, { error: 'for must be 1h or 1d' });
      next.snoozed[body.id] = now + span;
    }
    writeAlertState(home, next);
    send(res, 204);
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (!hub) return send(res, 404, { error: 'not a hub' });
    const path = new URL(req.url ?? '', 'http://local').pathname.replace(/\/+$/, '');
    if (path === '' || path === '/') return list(req, res);
    // Returned, not fired and forgotten: the caller must see the answer only once the body is read and stored.
    if (path === '/ack') return mutate(req, res, 'ack');
    if (path === '/snooze') return mutate(req, res, 'snooze');
    return send(res, 404, { error: 'not found' });
  };
}
