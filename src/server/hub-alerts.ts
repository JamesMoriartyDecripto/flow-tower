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
import { evaluateAlerts, applyAcks, pruneState, RULES, RULE_TITLES, type AckState } from './alerts.ts';
import { alertInput } from './alert-inputs.ts';
import { readAlertState, writeAlertState } from './alerts-state.ts';
import { machineRows } from './machines.ts';
import { tokenStore } from './tokens.ts';
import { loadConfig } from './config.ts';
import type { Satellites } from './satellites.ts';

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

export function hubAlerts({ satellites, home, hub, db }: HubAlertOptions) {
  /** The alerts as the page shows them: evaluated now, acks applied, stale state pruned on the way. */
  const evaluate = (now: number) => {
    const config = loadConfig({ home }).config;
    const rows = machineRows(tokenStore(home).list(), satellites.list(), now);
    // `firing` is every alert whose condition holds, snoozed or not: an ack or snooze may only target one of these.
    const firing = evaluateAlerts(alertInput(db, rows, config, now));
    const stored = readAlertState(home);
    // Pruned before it is applied: an entry for an alert that no longer fires must not outlive its condition.
    const state = pruneState(stored, firing);
    if (JSON.stringify(state) !== JSON.stringify(stored)) writeAlertState(home, state);
    return { config, firing, state, shown: applyAcks(firing, state, now) };
  };

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
    const next: AckState = { acked: { ...state.acked }, snoozed: { ...state.snoozed } };
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
