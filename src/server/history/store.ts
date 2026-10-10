/**
 * History writer (#84): one transaction per accepted batch, deduped on `event_key`, with the hourly and
 * daily rollups updated in the same transaction. Keeping events and rollups in one transaction means a
 * crash can never leave a counted event missing from its bucket.
 */
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

/** Start of the UTC day holding `ts`. UTC, not local: the DB must not change meaning with TZ. */
function dayStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface History {
  write(events: FlowEvent[]): void;
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

  return { write };
}
