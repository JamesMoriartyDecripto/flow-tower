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
import { COLUMNS, createHistory, RETENTION, userFilter } from '../server/history/store.ts';
import type { DatabaseSync } from 'node:sqlite';

const USAGE = 'usage: flow-tower history export [--user <u>] | delete --user <u> | info';

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
  const filter = user === undefined ? undefined : userFilter(user);
  const sql = `SELECT ${COLUMNS.join(', ')} FROM events ${filter ? `WHERE ${filter.sql} ` : ''}ORDER BY ts`;
  const rows = db.prepare(sql).all(...(filter?.args ?? [])) as Record<string, unknown>[];
  for (const row of rows) console.log(JSON.stringify(row));
}

/**
 * Erases one user's rows. The store does the work (one transaction, counts read inside it) so the CLI and
 * the server share the same `user = ''` rule, NULL rows from an older build included; VACUUM then runs
 * after the transaction, which is what actually shrinks the file.
 */
function deleteUser(db: DatabaseSync, user: string): void {
  const { events, rollups } = createHistory(db).eraseUser(user);
  db.exec('VACUUM');
  console.log(`deleted ${events} events and ${rollups} rollup rows for user "${user}"`);
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
