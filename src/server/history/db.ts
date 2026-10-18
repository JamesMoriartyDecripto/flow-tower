/**
 * The history database (#84). node:sqlite only exists from Node 22.13 and is experimental, so the module
 * is imported dynamically: a Node without it disables history with a clear reason instead of failing at
 * load, and the live view keeps working. The file lives in the user's folder (userHome()), never a repo.
 */
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { migrate } from './schema.ts';

/** The reason history stays off: names the requirement and says the rest of the tool is unaffected. */
export const DISABLED_MESSAGE = 'history needs Node >= 22.13; the live view still works';

export type HistoryOpen = { db: DatabaseSync } | { disabled: string };

/** Owner only, best effort: a file system that refuses chmod (EPERM, some mounts) is not an error. */
function ownerOnly(path: string, mode: number) {
  try { chmodSync(path, mode); } catch { /* best effort */ }
}

/**
 * True only for Node's "SQLite is an experimental feature" notice: an ExperimentalWarning (the `type`
 * argument, or the name of an Error warning) whose message mentions SQLite. Anything else is not ours to hide.
 */
export function isSqliteExperimentalWarning(warning: unknown, type?: unknown): boolean {
  const kind = type ?? (warning instanceof Error ? warning.name : undefined);
  const message = warning instanceof Error ? warning.message : warning;
  return kind === 'ExperimentalWarning' && typeof message === 'string' && message.includes('SQLite');
}

/**
 * Loads node:sqlite, or returns undefined when this Node has no usable module. Shared by the history DB and
 * the file viewer's SQLite preview, so the warning filter below has exactly one copy.
 */
export async function importSqlite(): Promise<typeof import('node:sqlite') | undefined> {
  // Node 22 flags node:sqlite with an ExperimentalWarning that users read as a failure; Node 24 no longer
  // prints it. Only this one notice is dropped, only while the module loads, and the original is always restored.
  const emitWarning = process.emitWarning;
  process.emitWarning = function (this: unknown, ...args: unknown[]) {
    const [warning, second] = args;
    const type = typeof second === 'object' && second !== null ? (second as { type?: unknown }).type : second;
    if (isSqliteExperimentalWarning(warning, type)) return;
    return (emitWarning as (...a: unknown[]) => void).apply(this, args);
  } as typeof process.emitWarning;
  let sqlite: typeof import('node:sqlite');
  try {
    sqlite = await import('node:sqlite');
  } catch {
    return undefined;
  } finally {
    process.emitWarning = emitWarning;
  }
  return typeof sqlite.DatabaseSync === 'function' ? sqlite : undefined;
}

/**
 * Opens (creating it if needed) the history DB at `path`. WAL so the server can write while the UI reads,
 * and NORMAL is safe enough for telemetry. migrates on open, so every caller sees the current schema.
 */
export async function openHistory(path: string): Promise<HistoryOpen> {
  const sqlite = await importSqlite();
  if (!sqlite) return { disabled: DISABLED_MESSAGE };
  // 0700 only on a folder we create: one the user chose is left as it is (src/server/tokens.ts does the same).
  const dir = dirname(path);
  if (!existsSync(dir)) { mkdirSync(dir, { recursive: true, mode: 0o700 }); ownerOnly(dir, 0o700); }
  const db = new sqlite.DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  ownerOnly(path, 0o600);
  migrate(db);
  // WAL keeps recent writes in sidecar files that SQLite may have created with a wider mode; they hold the
  // same telemetry as the DB, so they get the same 0600. Created lazily by SQLite, so best effort: absent
  // files are simply not there to lock down yet.
  for (const suffix of ['-wal', '-shm']) ownerOnly(`${path}${suffix}`, 0o600);
  return { db };
}
