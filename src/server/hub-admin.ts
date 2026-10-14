/**
 * The Hub panel's admin routes (#93). The operator manages senders, viewers, cadence, budgets, alerts,
 * retention and history from the panel instead of editing files. Every route answers only to this machine:
 * a remote request gets 404 with nothing read or changed, and a cross-site page is refused with 403. Each
 * successful change writes its file, then one audit line, then answers.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { crossSite, isJson } from './guard.ts';
import { isRemote } from './auth.ts';
import { tokenStore } from './tokens.ts';
import { loadConfig, CADENCES, ConfigSchema } from './config.ts';
import { formatMessage, sendNotification, type FetchLike, type NotifyAlert, type NotifyConfig } from './alert-notify.ts';
import { hostname } from 'node:os';
import { readUserConfig, writeUserConfig } from './user-config.ts';
import { appendAudit, readAudit } from './admin-audit.ts';
import { resetViewersCache } from './hub.ts';
import { RULES } from './alerts.ts';
import type { History } from './history/store.ts';

export interface HubAdminOptions {
  /** The user folder: tokens.json, config.json and admin-audit.jsonl all live here. */
  home: string;
  /** Hub mode as the caller knows it: off means this server is not a hub, so the routes do not exist. */
  hub: boolean;
  /** The history writer, or undefined when history is disabled: the delete routes then have nothing to do. */
  history?: History;
  /** The base URL a sender uses to reach this hub, for the connect line. */
  hubUrl: () => string;
  /** The sender for the test alert; the tests pass a fake, the server leaves it to the global fetch. */
  fetch?: FetchLike;
}

/** A few bytes per request: a sender id, a viewer list, a budget map. A bigger body is refused. */
const MAX_BODY = 16 * 1024;
const ID = /^[a-z0-9-]{1,32}$/;

const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

/** One JSON object under MAX_BODY, or undefined after a refusal was sent. */
async function readJson(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) { send(res, 413, { error: 'body too large' }); req.destroy(); return undefined; }
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { return null; }
}

const SenderBody = z.strictObject({ id: z.string().regex(ID, 'id must be 1-32 characters of a-z, 0-9 or -'), cadence: z.enum(CADENCES).optional() });
const ConfirmBody = z.strictObject({ confirm: z.string() });
const ViewersBody = z.strictObject({ viewers: z.array(z.string().min(1).max(200)).max(200) });
const CadenceBody = z.strictObject({ cadence: z.record(z.string().regex(ID), z.enum(CADENCES)) });
const BudgetsBody = z.strictObject({
  global: z.number().min(0).optional(),
  projects: z.record(z.string().min(1).max(200), z.number().min(0)).optional(),
});
/** Known rules only: a rule name that is not one of ours is a typo to refuse, not a setting to store. */
// A partial map: a PUT names only the rules it changes, so every key is optional (zod's enum-keyed record would demand all).
const AlertsBody = z.strictObject({ rule: z.partialRecord(z.enum(RULES), z.boolean()) });
const RetentionBody = z.strictObject({ retentionDays: z.number().int().min(1).max(21) });
const BeforeBody = z.strictObject({ before: z.number().int().nonnegative(), confirm: z.literal(true) });
const CountQuery = z.object({ before: z.coerce.number().int().nonnegative() });
/** The same schema config.json is checked against, so a URL the file would refuse is refused here too. */
const NotifyBody = ConfigSchema.shape.notify.unwrap();
const ThresholdsBody = z.strictObject({ errors: z.number().int().min(1).max(1000) });

/** The webhook as the panel may see it: whether it is set, its format, and the host only. The url's path can hold a token. */
const notifyView = (notify: NotifyConfig | undefined) => {
  if (!notify) return { set: false };
  return { set: true, format: notify.format, host: new URL(notify.url).host };
};

/** The test alert the panel sends: fixed text, so the receiver sees nothing the operator did not type here. */
// The rule is `test`, not `silent`: a json receiver would otherwise file this as a real silent-machine alert.
const testAlert: NotifyAlert = {
  id: 'test:hub:hub',
  rule: 'test',
  level: 'warning',
  subject: { kind: 'hub', name: 'hub' },
  message: 'Test from Flow Tower hub',
};

/** A token-free view of the senders, for the panel: the hashes never leave the token store. */
const senderView = (home: string) => {
  const cfg = loadConfig({ home }).config;
  return tokenStore(home).list().map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    paused: t.paused ?? false,
    revoked: t.revokedAt !== undefined,
    ...(t.login === undefined ? {} : { login: t.login }),
    ...(cfg.cadence?.[t.id] === undefined ? {} : { cadence: cfg.cadence[t.id] }),
  }));
};

export function hubAdmin({ home, hub, history, hubUrl, fetch: fetchFn }: HubAdminOptions) {
  /** Shared guards for every mutating route: 404 first (remote), then 403 (cross-site), then the method. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (isRemote(req, { hub })) { send(res, 404, { error: 'not found' }); return false; }
    if (crossSite(req)) { send(res, 403, { error: 'cross-site requests are refused' }); return false; }
    if (req.method !== method) { send(res, 405, { error: 'method not allowed' }); return false; }
    return true;
  };

  /** A config change: merge into config.json, drop the viewers memo, then one audit line. */
  const writeConfig = (patch: Record<string, unknown>) => {
    writeUserConfig(home, patch);
    resetViewersCache();
  };

  /** The validated body, or undefined after a 400/413 was sent: the schema's type carries through to the caller. */
  const readBody = async <S extends z.ZodType>(req: IncomingMessage, res: ServerResponse, schema: S): Promise<z.infer<S> | undefined> => {
    const raw = await readJson(req, res);
    if (res.writableEnded || raw === undefined) return undefined;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) { send(res, 400, { error: parsed.error.issues[0]?.message ?? 'invalid body' }); return undefined; }
    return parsed.data as z.infer<S>;
  };

  const getAdmin = (req: IncomingMessage, res: ServerResponse) => {
    if (isRemote(req, { hub })) return send(res, 404, { error: 'not found' });
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    const cfg = loadConfig({ home }).config;
    send(res, 200, {
      senders: senderView(home),
      viewers: cfg.viewers ?? [],
      cadence: cfg.cadence ?? {},
      budgets: cfg.budgets ?? {},
      alerts: cfg.alerts ?? {},
      retentionDays: cfg.retentionDays ?? 14,
      notify: notifyView(cfg.notify),
      alertThresholds: cfg.alertThresholds ?? {},
      audit: readAudit(home),
    });
  };

  const addSender = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'POST')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, SenderBody);
    if (!body) return;
    let token: string;
    try {
      token = tokenStore(home).create(body.id).token;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('already exists')) return send(res, 409, { error: message });
      return send(res, 400, { error: message });
    }
    if (body.cadence !== undefined) {
      const current = (readUserConfig(home).cadence ?? {}) as Record<string, unknown>;
      writeConfig({ cadence: { ...current, [body.id]: body.cadence } });
    }
    appendAudit(home, { action: 'sender.add', target: body.id, ...(body.cadence ? { detail: { cadence: body.cadence } } : {}) });
    // The token is answered once, here, and never written anywhere: the audit line above names only the id.
    // The configLine stays the bare command (it is what Copy copies); the panel adds the other-machine hint to the
    // text it shows, so the copied command still runs as it is on a machine with flow-tower on PATH.
    send(res, 200, { token, configLine: `flow-tower connect ${hubUrl()} --token ${token} --machine ${body.id}` });
  };

  /** pause, resume and revoke share one shape: an id in the path, the token store does the change. */
  const senderAction = async (req: IncomingMessage, res: ServerResponse, id: string, action: 'pause' | 'resume' | 'revoke') => {
    if (!guard(req, res, 'POST')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    if (!ID.test(id)) return send(res, 400, { error: 'id must be 1-32 characters of a-z, 0-9 or -' });
    if (action === 'revoke') {
      const body = await readBody(req, res, ConfirmBody);
      if (!body) return;
      if (body.confirm !== id) return send(res, 400, { error: 'confirm must equal the sender id' });
    } else if (res.writableEnded) {
      return;
    } else {
      await readJson(req, res);
      if (res.writableEnded) return;
    }
    const known = tokenStore(home).list().some((t) => t.id === id && t.revokedAt === undefined);
    if (!known) return send(res, 404, { error: 'no such sender' });
    if (action === 'revoke') tokenStore(home).revoke(id);
    else tokenStore(home).pause(id, action === 'pause');
    appendAudit(home, { action: `sender.${action}`, target: id });
    send(res, 204);
  };

  const putViewers = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'PUT')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, ViewersBody);
    if (!body) return;
    writeConfig({ viewers: body.viewers });
    appendAudit(home, { action: 'viewers.set', target: 'hub', detail: { count: body.viewers.length } });
    send(res, 204);
  };

  const putCadence = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'PUT')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, CadenceBody);
    if (!body) return;
    writeConfig({ cadence: body.cadence });
    for (const [id, value] of Object.entries(body.cadence)) appendAudit(home, { action: 'cadence.set', target: id, detail: { cadence: value } });
    send(res, 204);
  };

  const putBudgets = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'PUT')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, BudgetsBody);
    if (!body) return;
    // The raw user file, not the merged config: the checkout's local budgets must not be copied into the user's file.
    const current = (readUserConfig(home).budgets ?? {}) as Record<string, unknown>;
    const next = { ...current, ...body };
    writeConfig({ budgets: next });
    appendAudit(home, { action: 'budgets.set', target: 'hub', detail: { global: body.global ?? null, projects: Object.keys(body.projects ?? {}).length } });
    send(res, 204);
  };

  const putAlerts = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'PUT')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, AlertsBody);
    if (!body) return;
    const current = loadConfig({ home }).config.alerts ?? {};
    writeConfig({ alerts: { ...current, ...body.rule } });
    for (const [rule, on] of Object.entries(body.rule)) appendAudit(home, { action: 'alert.set', target: rule, detail: { enabled: on } });
    send(res, 204);
  };

  const putRetention = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'PUT')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, RetentionBody);
    if (!body) return;
    writeConfig({ retentionDays: body.retentionDays });
    appendAudit(home, { action: 'retention.set', target: 'hub', detail: { retentionDays: body.retentionDays } });
    send(res, 204);
  };

  const countHistory = (req: IncomingMessage, res: ServerResponse) => {
    if (isRemote(req, { hub })) return send(res, 404, { error: 'not found' });
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    const q = CountQuery.safeParse(Object.fromEntries(new URL(req.url ?? '', 'http://local').searchParams));
    if (!q.success) return send(res, 400, { error: 'before must be a timestamp in ms' });
    const events = history ? history.countBefore(q.data.before) : 0;
    send(res, 200, { events });
  };

  const deleteBefore = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'POST')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, BeforeBody);
    if (!body) return;
    if (!history) return send(res, 409, { error: 'history is disabled' });
    const deleted = history.deleteBefore(body.before);
    appendAudit(home, { action: 'history.delete', target: 'hub', detail: { before: body.before, deleted } });
    send(res, 200, { deleted });
  };

  const putNotify = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'PUT')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, NotifyBody);
    if (!body) return;
    writeConfig({ notify: body });
    appendAudit(home, { action: 'notify.set', target: 'hub', detail: { format: body.format, host: new URL(body.url).host } });
    send(res, 204);
  };

  const deleteNotify = (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'DELETE')) return;
    const current = readUserConfig(home).notify;
    // Only a webhook that is actually there is removed: the audit line must not claim a change that did not happen.
    if (current !== undefined) {
      writeConfig({ notify: undefined });
      const host = (() => { try { return new URL(String((current as { url?: unknown }).url)).host; } catch { return undefined; } })();
      appendAudit(home, { action: 'notify.remove', target: 'hub', detail: { format: (current as { format?: unknown }).format, host } });
    }
    send(res, 204);
  };

  /** Sends one fixed test alert through the same sender the notifier uses. Answers ok and status only: never the url. */
  const postNotifyTest = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'POST')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const raw = await readJson(req, res);
    if (res.writableEnded || raw === undefined) return;
    const notify = loadConfig({ home }).config.notify;
    if (!notify) return send(res, 409, { error: 'no webhook is set' });
    const result = await sendNotification(notify, formatMessage(testAlert, 'open', notify.format, hostname()), fetchFn);
    appendAudit(home, { action: 'notify.test', target: 'hub', detail: { format: notify.format, host: new URL(notify.url).host, ok: result.ok } });
    send(res, 200, result.status === undefined ? { ok: result.ok } : { ok: result.ok, status: result.status });
  };

  const putThresholds = async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res, 'PUT')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    const body = await readBody(req, res, ThresholdsBody);
    if (!body) return;
    const current = (readUserConfig(home).alertThresholds ?? {}) as Record<string, unknown>;
    writeConfig({ alertThresholds: { ...current, ...body } });
    appendAudit(home, { action: 'thresholds.set', target: 'errors', detail: { errors: body.errors } });
    send(res, 204);
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (!hub) return send(res, 404, { error: 'not a hub' });
    const url = new URL(req.url ?? '', 'http://local');
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '' || path === '/') return getAdmin(req, res);
    if (path === '/senders') return addSender(req, res);
    const sender = /^\/senders\/([^/]+)\/(pause|resume|revoke)$/.exec(path);
    if (sender) return senderAction(req, res, decodeURIComponent(sender[1]), sender[2] as 'pause' | 'resume' | 'revoke');
    if (path === '/viewers') return putViewers(req, res);
    if (path === '/cadence') return putCadence(req, res);
    if (path === '/budgets') return putBudgets(req, res);
    if (path === '/alerts') return putAlerts(req, res);
    if (path === '/retention') return putRetention(req, res);
    if (path === '/history/count') return countHistory(req, res);
    if (path === '/history/delete-before') return deleteBefore(req, res);
    if (path === '/notify') return req.method === 'DELETE' ? deleteNotify(req, res) : putNotify(req, res);
    if (path === '/notify/test') return postNotifyTest(req, res);
    if (path === '/thresholds') return putThresholds(req, res);
    return send(res, 404, { error: 'not found' });
  };
}
