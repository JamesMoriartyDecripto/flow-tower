/**
 * History schema (#84), versioned with PRAGMA user_version: no migration table, and an old file upgrades
 * in place. Every column is content-free by design — identity, kind, tool and token counts only: no prompt
 * or response text, no file paths or contents, no command arguments, no message strings. History is
 * metadata about runs, never what ran.
 */
import type { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 1;

/**
 * One row per event. `event_key` is UNIQUE so a replayed delivery (same event id) collapses to one row,
 * and the two indexes serve the two reads: recent activity by ts, and per-user history by (user, ts).
 */
const EVENTS = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  ts INTEGER,
  sender TEXT,
  user TEXT,
  host TEXT,
  runtime TEXT,
  project TEXT,
  session TEXT,
  kind TEXT,
  tool TEXT,
  model TEXT,
  in_tok INTEGER,
  out_tok INTEGER,
  cache_read INTEGER,
  cache_write INTEGER,
  cost_usd_micros INTEGER,
  estimated INTEGER,
  duration_ms INTEGER,
  status TEXT,
  auto INTEGER,
  event_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS events_user_ts ON events(user, ts);`;

/**
 * A rollup row per key and bucket. Key columns are NOT NULL DEFAULT '' rather than nullable: SQLite treats
 * NULLs as distinct in a PRIMARY KEY, so a null user would silently duplicate a row instead of updating it.
 */
const rollup = (name: string) => `
CREATE TABLE IF NOT EXISTS ${name} (
  bucket INTEGER NOT NULL,
  user TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  runtime TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  events INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  in_tok INTEGER NOT NULL DEFAULT 0,
  out_tok INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  cost_usd_micros INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, user, project, runtime, model)
);`;

/** SQL text of every DDL statement, in order: also what the tests inspect (no hidden string building). */
export const SCHEMA_SQL = [EVENTS, rollup('rollup_hourly'), rollup('rollup_daily')];

/** Brings any file (fresh or older) to SCHEMA_VERSION. Idempotent: a current file returns untouched. */
export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;
  // One transaction: a crash halfway must not leave half the tables behind with the version already bumped.
  db.exec('BEGIN');
  try {
    for (const sql of SCHEMA_SQL) db.exec(sql);
    // PRAGMA values take no bind parameters; SCHEMA_VERSION is a local integer, not user input.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const schemaVersion = () => SCHEMA_VERSION;
