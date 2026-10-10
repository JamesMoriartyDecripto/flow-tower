/**
 * History writer (#84): one transaction per accepted batch, deduped on `event_key`, with the hourly and
 * daily rollups updated in the same transaction. Keeping events and rollups in one transaction means a
 * crash can never leave a counted event missing from its bucket.
 */
import { env } from 'node:process';
import type { DatabaseSync } from 'node:sqlite';
import type { FlowEvent } from '../../core/events.ts';
import { toRow, type Row } from './row.ts';

const COLUMNS = ['ts', 'sender', 'user', 'host', 'runtime', 'project', 'session', 'kind', 'tool', 'model', 'in_tok', 'out_tok', 'cache_read', 'cache_write', 'cost_usd_micros', 'estimated', 'duration_ms', 'status', 'auto', 'event_key'] as const;

const INSERT = `INSERT OR IGNORE INTO events (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`;

/** Rollup key columns; '' stands for "unknown" so NULL users cannot duplicate a row (see schema.ts). */
const rollupUpsert = (table: string) => `
INSERT INTO ${table} (bucket, user, project, runtime, model, events, errors, in_tok, out_tok, cache_read, cache_write, cost_usd_micros)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(bucket, user, project, runtime, model) DO UPDATE SET
  events = events + excluded.events,
  errors = errors + excluded.errors,
  in_tok = in_tok + excluded.in_tok,
  out_tok = out_tok + excluded.out_tok,
  cache_read = cache_read + excluded.cache_read,
  cache_write = cache_write + excluded.cache_write,
  cost_usd_micros = cost_usd_micros + excluded.cost_usd_micros`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The group-by columns a caller may ask for: the key columns of both rollups, and nothing else. */
export const TOTAL_KEYS = ['user', 'project', 'runtime', 'model'] as const;
export type TotalKey = (typeof TOTAL_KEYS)[number];
export const isTotalKey = (v: string): v is TotalKey => (TOTAL_KEYS as readonly string[]).includes(v);

/** One aggregated row: the requested key fields (`''` means unknown) plus the sums, cost already in dollars. */
export type TotalsRow = { [K in TotalKey]?: string } & {
  events: number;
  errors: number;
  in_tok: number;
  out_tok: number;
  cache_read: number;
  cache_write: number;
  cost_usd: number;
};

export interface TotalsQuery {
  from: number;
  to: number;
  /** Empty means "one row for the whole range". */
  by: TotalKey[];
}

/**
 * Retention (#84). Per-person raw events are kept briefly only: beyond 21 days that data must be watched
 * through remote monitoring endpoints under Italian guidance, not in a local DB, so the cap is the policy.
 * The rollups are aggregate and content-free, so they live long enough to chart a year.
 */
export const RETENTION = { minDays: 1, maxDays: 21, defaultDays: 14, hourlyDays: 90, dailyDays: 395 } as const;

/** FLOW_TOWER_RETENTION_DAYS read and clamped to 1..21; a missing or unparsable value falls back to 14. */
export function retentionDays(value: string | undefined = env.FLOW_TOWER_RETENTION_DAYS): number {
  if (value === undefined || value.trim() === '') return RETENTION.defaultDays;
  const n = Number(value);
  if (!Number.isFinite(n)) return RETENTION.defaultDays;
  return Math.min(RETENTION.maxDays, Math.max(RETENTION.minDays, Math.trunc(n)));
}

/** Start of the UTC day holding `ts`. UTC, not local: the DB must not change meaning with TZ. */
function dayStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface History {
  write(events: FlowEvent[]): void;
  /** Drops rows older than the retention window; `now` is injectable so the policy is testable on a fake clock. */
  prune(now?: number, opts?: { rawDays?: number }): void;
  /** Aggregates the rollups over a range, grouped by the requested key columns (#84 phase 4). */
  totals(query: TotalsQuery): TotalsRow[];
  /** What the DB currently holds: retention window, oldest raw event, row count. */
  info(): HistoryInfo;
}

/** Shape of GET /api/history/info: enough for a UI to say how far back the charts go. */
export interface HistoryInfo {
  enabled: true;
  rawDays: number;
  /** Epoch milliseconds of the oldest raw event, or null when there is none. */
  oldest: number | null;
  rows: number;
}

/**
 * A writer over an open DB. `write` is synchronous and called from ingest, so a bad batch (SQLite error)
 * rolls the whole batch back rather than half-writing it.
 */
export function createHistory(db: DatabaseSync): History {
  const insert = db.prepare(INSERT);
  const hourly = db.prepare(rollupUpsert('rollup_hourly'));
  const daily = db.prepare(rollupUpsert('rollup_daily'));

  const write = (events: FlowEvent[]): void => {
    const now = Date.now();
    const rows = events.map((e) => toRow(e, now)).filter((r): r is Row => r !== undefined);
    if (!rows.length) return;
    db.exec('BEGIN');
    try {
      for (const row of rows) {
        // INSERT OR IGNORE collapses a replayed delivery; only a row we actually inserted moves the
        // rollups, or a duplicate would be counted once in events but twice in the buckets.
        const res = insert.run(...COLUMNS.map((c) => row[c]));
        if (Number(res.changes) === 0) continue;
        const key: [string, string, string, string] = [row.user ?? '', row.project ?? '', row.runtime ?? '', row.model ?? ''];
        const totals = [row.in_tok, row.out_tok, row.cache_read, row.cache_write, row.cost_usd_micros];
        for (const [table, bucket] of [[hourly, Math.floor(row.ts / HOUR) * HOUR], [daily, dayStart(row.ts)]] as const) {
          table.run(bucket, ...key, 1, row.status === 'error' ? 1 : 0, ...totals);
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const prune = (now = Date.now(), opts: { rawDays?: number } = {}): void => {
    const rawDays = Math.min(RETENTION.maxDays, Math.max(RETENTION.minDays, opts.rawDays ?? retentionDays()));
    const cuts: [string, string, number][] = [
      ['events', 'ts', now - rawDays * DAY],
      ['rollup_hourly', 'bucket', now - RETENTION.hourlyDays * DAY],
      ['rollup_daily', 'bucket', now - RETENTION.dailyDays * DAY],
    ];
    db.exec('BEGIN');
    try {
      for (const [table, col, limit] of cuts) db.prepare(`DELETE FROM ${table} WHERE ${col} < ?`).run(limit);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  /**
   * Reads one rollup table (#84 phase 4): the hourly one while the range fits its 90-day retention,
   * the daily one beyond that (the hourly rows would already be pruned). Every column name here comes
   * from TOTAL_KEYS, never from the query string, and every value is bound, so nothing is interpolated
   * from the request.
   */
  const totals = ({ from, to, by }: TotalsQuery): TotalsRow[] => {
    const hourly = to - from <= RETENTION.hourlyDays * DAY;
    const table = hourly ? 'rollup_hourly' : 'rollup_daily';
    const step = hourly ? HOUR : DAY;
    // Both rollups store a bucket as its start, so align the range to the grid: a bucket is an aggregate
    // over its whole interval, there is no way to slice the partial hours at the range ends.
    const [lo, hi] = [Math.floor(from / step) * step, Math.ceil(to / step) * step];
    const cols = TOTAL_KEYS.filter((k) => by.includes(k));
    const sums = 'SUM(events) AS events, SUM(errors) AS errors, SUM(in_tok) AS in_tok, SUM(out_tok) AS out_tok, SUM(cache_read) AS cache_read, SUM(cache_write) AS cache_write, SUM(cost_usd_micros) AS micros';
    const sql = `SELECT ${cols.length ? `${cols.join(', ')}, ` : ''}${sums} FROM ${table} WHERE bucket >= ? AND bucket <= ?`
      + (cols.length ? ` GROUP BY ${cols.join(', ')} ORDER BY ${cols.join(', ')}` : '');
    const rows = db.prepare(sql).all(lo, hi) as Record<string, string | number>[];
    return rows.map((r) => {
      const out = {} as TotalsRow;
      for (const c of cols) out[c] = String(r[c] ?? '');
      out.events = Number(r.events);
      out.errors = Number(r.errors);
      out.in_tok = Number(r.in_tok);
      out.out_tok = Number(r.out_tok);
      out.cache_read = Number(r.cache_read);
      out.cache_write = Number(r.cache_write);
      // Money is stored in integer micros; the API speaks dollars, per the read contract.
      out.cost_usd = Number(r.micros) / 1_000_000;
      return out;
    });
  };

  const info = (): HistoryInfo => {
    const oldest = (db.prepare('SELECT MIN(ts) AS ts FROM events').get() as { ts: number | null }).ts;
    const rows = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
    return { enabled: true, rawDays: retentionDays(), oldest: oldest ?? null, rows };
  };

  return { write, prune, totals, info };
}
