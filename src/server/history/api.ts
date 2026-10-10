/**
 * Read-only history API (#84 phase 4). Two routes over the store: aggregate totals and what the DB holds.
 * The queries are content-free by construction — the store only ever reads the rollup tables — and the
 * request can only pick a range and an allow-listed group-by, never a column or an expression.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crossSite } from '../guard.ts';
import { DISABLED_MESSAGE } from './db.ts';
import { isTotalKey, TOTAL_KEYS, type History, type TotalKey } from './store.ts';

const DAY = 86_400_000;
const DEFAULT_DAYS = 7;

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

/** Epoch-ms parameter: a plain finite number, or undefined when absent/blank/unparsable (then the default). */
const ms = (v: string | null): number | undefined => {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The two read handlers, both behind the crossSite check (like /api/workspace) and, in hub mode, the
 * remote-viewer rule from #83: /api/history is a viewing route, not a sensitive one, so a listed tailnet
 * user reaches it exactly like /api/workspace, while a stranger is refused before the route.
 */
export function historyHandler(history: History | undefined) {
  /** Disabled history is not an error: the page still loads and shows the message. */
  const off = { disabled: DISABLED_MESSAGE };

  const totals = (req: IncomingMessage, res: ServerResponse) => {
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (!history) return send(res, 200, off);
    const url = new URL(req.url ?? '', 'http://local');
    const to = ms(url.searchParams.get('to')) ?? Date.now();
    const from = ms(url.searchParams.get('from')) ?? to - DEFAULT_DAYS * DAY;
    const raw = (url.searchParams.get('by') ?? '').trim();
    const parts = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    // An unknown group-by is a client error, never silently dropped: the answer must match the question.
    const bad = parts.filter((p) => !isTotalKey(p));
    if (bad.length) return send(res, 400, { error: `unknown by: ${bad.join(', ')} (allowed: ${TOTAL_KEYS.join(', ')})` });
    if (from > to) return send(res, 400, { error: 'from must not be after to' });
    const by = parts as TotalKey[];
    send(res, 200, { from, to, by, rows: history.totals({ from, to, by }) });
  };

  const info = (req: IncomingMessage, res: ServerResponse) => {
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    send(res, 200, history ? history.info() : off);
  };

  return { totals, info };
}
