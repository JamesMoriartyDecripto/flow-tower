/**
 * `flow-tower history export|delete|info` (#84 phase 4): reads and erases the local SQLite history.
 * The DB is TypeScript-side (src/server/history/), so the plain-JS CLI runs this file with Node's
 * built-in type stripping, exactly like `token` (#83) and `validate`. The file lives in userHome():
 * FLOW_TOWER_HOME or ~/.config/flow-tower, never the checkout. Every column read or exported here is
 * the writer's allow-list (store.ts COLUMNS): no prompt, path, argument or message can ever be printed.
 */
import { argv, exit } from 'node:process';
import { join } from 'node:path';
import { userHome } from '../core/secrets.ts';
import { openHistory } from '../server/history/db.ts';
import { COLUMNS, createHistory, RETENTION } from '../server/history/store.ts';
import type { DatabaseSync } from 'node:sqlite';

const USAGE = 'usage: flow-tower history export [--user <u>] | delete --user <u> | info';

/** The three tables holding a user's data; every one is keyed by `user`, so a delete covers all of them. */
const TABLES = ['events', 'rollup_hourly', 'rollup_daily'] as const;

/**
 * `--user <u>`: presence is what matters, because the empty string is a real value (rows with no user).
 * The space form only: the value is passed through from the shell untouched, so `--user ''` works.
 */
function parseUser(args: string[]): { present: boolean; value: string } {
  const i = args.indexOf('--user');
  return i < 0 ? { present: false, value: '' } : { present: true, value: args[i + 1] ?? '' };
}

/** One JSONL line per events row, oldest first: the export format is data, so it goes to stdout alone. */
function exportEvents(db: DatabaseSync, user: string | undefined): void {
  const sql = `SELECT ${COLUMNS.join(', ')} FROM events ${user === undefined ? '' : 'WHERE user = ? '}ORDER BY ts`;
  const rows = db.prepare(sql).all(...(user === undefined ? [] : [user])) as Record<string, unknown>[];
  for (const row of rows) console.log(JSON.stringify(row));
}

/**
 * Erases one user's rows. Counts are read before the delete so the shell is told exactly how much went;
 * VACUUM runs after the transaction (it cannot run inside one) and is what actually shrinks the file.
 */
function deleteUser(db: DatabaseSync, user: string): void {
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user = ?`).get(user) as { n: number }).n;
  const before = TABLES.map(count);
  db.exec('BEGIN');
  try {
    for (const table of TABLES) db.prepare(`DELETE FROM ${table} WHERE user = ?`).run(user);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('VACUUM');
  console.log(`deleted ${before[0]} events and ${before[1] + before[2]} rollup rows for user "${user}"`);
}

/** What the DB holds right now: where it is, how many rows, who is in it, and how far back it goes. */
function info(db: DatabaseSync): void {
  const { rows, oldest, rawDays } = createHistory(db).info();
  const users = (db.prepare('SELECT DISTINCT user FROM events ORDER BY user').all() as { user: string | null }[])
    .map((r) => r.user ?? '');
  console.log(`database: ${join(userHome(), 'history.db')}`);
  console.log(`rows: ${rows}`);
  console.log(`oldest: ${oldest === null ? 'none' : new Date(oldest).toISOString()}`);
  console.log(`users: ${users.length ? users.map((u) => u || '(unknown)').join(', ') : 'none'}`);
  console.log(`retention: ${rawDays} days raw (max ${RETENTION.maxDays}), ${RETENTION.hourlyDays} days hourly, ${RETENTION.dailyDays} days daily`);
}

const [cmd, ...args] = argv.slice(2);
const { present: hasUser, value: user } = parseUser(args);

// Opening creates the file when missing, so `info` on a fresh machine answers "0 rows" instead of failing.
const opened = await openHistory(join(userHome(), 'history.db'));
if ('disabled' in opened) {
  console.error(`history: ${opened.disabled}`);
  exit(1);
}

switch (cmd) {
  case 'export':
    exportEvents(opened.db, hasUser ? user : undefined);
    break;
  case 'delete':
    // A delete without a user would erase everyone's rows: refuse rather than guess.
    if (!hasUser) { console.error(USAGE); exit(2); }
    deleteUser(opened.db, user);
    break;
  case 'info':
    info(opened.db);
    break;
  default:
    console.error(USAGE);
    exit(2);
}
