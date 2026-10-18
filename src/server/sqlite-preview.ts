/**
 * Previews a SQLite database for the file viewer (#264): its schema as text, and the first rows of each
 * table and view. The file is opened read-only and only ever read, so looking at a database cannot change it.
 * node:sqlite is imported dynamically (importSqlite, shared with history/db.ts), so a Node without it gets a
 * clear error here instead of failing at load.
 */
import { existsSync, unlinkSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { DbCell, DbColumn, DbPreview, DbTable } from '../core/dbPreview.ts';
import { importSqlite } from './history/db.ts';

const HEADER = 'SQLite format 3\0';
/** Tables and views listed per database: a schema with thousands of tables would make the preview unreadable. */
const MAX_TABLES = 200;
/** Long text cells are cut: the preview is for reading, not for moving data out of the file. */
const MAX_TEXT = 500;
/** Columns shown per table; the rest are counted in columnsCut so the payload stays bounded. */
const MAX_COLUMNS = 100;
/** A full count scans the whole table, so counting stops here and the count is reported as capped. */
const COUNT_CAP = 100_000;
/** Cells read across the whole database: once spent, the remaining tables keep columns and counts only. */
const CELL_BUDGET = 20_000;
/*
 * Text characters read across the whole database. The cell budget alone does not bound the payload: 20,000
 * cells of 500 characters each still come to 10 MB of text. Once this is spent, the rest keep columns and counts.
 */
const TEXT_BUDGET = 2_000_000;
/** The schema text is cut at this length so one huge schema cannot make the payload huge. */
const SCHEMA_MAX_CHARS = 500_000;
const NEEDS_NODE = 'SQLite preview needs Node >= 22.13';

/**
 * True when the first 16 bytes are the SQLite header. Decided by the content, never the name: a database
 * can be called anything, and a file called `.db` can be plain text.
 */
export async function isSqliteFile(abs: string): Promise<boolean> {
  const fh = await open(abs, 'r');
  try {
    const buf = Buffer.alloc(HEADER.length);
    const { bytesRead } = await fh.read(buf, 0, HEADER.length, 0);
    return bytesRead === HEADER.length && buf.toString('latin1') === HEADER;
  } finally {
    await fh.close();
  }
}

/** Double-quoted identifier: an embedded quote is doubled, so `we"ird` stays one name. */
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** One cell as the viewer shows it: JSON-safe, and bounded in size. */
function cellOf(v: unknown): DbCell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  // A bigint beyond 2^53 cannot survive JSON as a number, so it travels as its exact decimal text.
  // Small integers come back to plain numbers, as the viewer expects.
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  const s = String(v);
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
}

/**
 * One cell from its SELECT value and its typeof(). A blob is selected as its byte length, so its bytes are
 * never loaded into the process; the size is shown as it always was.
 */
function cellAt(v: unknown, type: unknown): DbCell {
  if (type === 'blob') return `<blob ${Number(v)} bytes>`;
  return cellOf(v);
}

/**
 * Opens one database read-only, and reports the side files this open created (only ever set on the path
 * fallback). With no -wal beside the file, SQLite is asked to open it immutable as a URI: a read-only open
 * of a WAL database otherwise creates -wal and -shm next to the user's file. A live -wal keeps the plain
 * open, so its content is read. A Node whose DatabaseSync cannot take a URI falls back to the path.
 */
function openReadOnly(sqlite: typeof import('node:sqlite'), abs: string): { db: DatabaseSync; created: string[] } {
  if (existsSync(`${abs}-wal`)) return { db: new sqlite.DatabaseSync(abs, { readOnly: true }), created: [] };
  try {
    // A URI that this Node does not read names no file, so the open fails here and the path is tried.
    const uri = `${pathToFileURL(abs).href}?mode=ro&immutable=1`;
    return { db: new sqlite.DatabaseSync(uri, { readOnly: true }), created: [] };
  } catch {
    // Only the side files that are absent now are ours to remove afterwards.
    const created = [`${abs}-wal`, `${abs}-shm`].filter((p) => !existsSync(p));
    try {
      return { db: new sqlite.DatabaseSync(abs, { readOnly: true }), created };
    } catch (e) {
      removeFiles(created);
      throw e;
    }
  }
}

/** Removes files this preview created; a file already gone is not an error. Synchronous, so it can run in a catch. */
function removeFiles(files: string[]): void {
  for (const f of files) {
    try {
      unlinkSync(f);
    } catch {
      // Already gone: nothing to undo.
    }
  }
}

export type SchemaRow = { type: string; name: string; sql: string | null };

/**
 * Reads one database. Only SELECTs run, on a connection opened read-only; the caller gets either the
 * preview or a reason it could not be read (a corrupt or locked file, for instance).
 */
export async function readSqlitePreview(abs: string, maxRows = 100): Promise<{ content: string; db: DbPreview } | { error: string }> {
  const sqlite = await importSqlite();
  if (!sqlite) return { error: NEEDS_NODE };
  let db: DatabaseSync | undefined;
  let created: string[] = [];
  try {
    const opened = openReadOnly(sqlite, resolve(abs));
    db = opened.db;
    created = opened.created;
    const schema = db
      .prepare("SELECT type, name, sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY rowid")
      .all() as SchemaRow[];
    const budget = { cells: CELL_BUDGET, text: TEXT_BUDGET };
    const tables = schema.slice(0, MAX_TABLES).map((r) => tableOf(db!, r, maxRows, budget));
    // Every statement of the schema, indexes and triggers included, so the text is the whole picture.
    const statements = db.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid').all() as { sql: string }[];
    const content = schemaText(statements.map((r) => r.sql), schema.length > MAX_TABLES);
    return { content, db: { source: 'sqlite', tables, tableCount: schema.length } };
  } catch (e) {
    // The message may name the absolute path; the viewer shows the file's name only.
    const message = e instanceof Error ? e.message : String(e);
    return { error: message.split(abs).join(basename(abs)) };
  } finally {
    db?.close();
    removeFiles(created);
  }
}

/** The statements as one text, each ended with `;`, cut at SCHEMA_MAX_CHARS with a visible note. */
function schemaText(sqls: string[], moreTables: boolean): string {
  const parts: string[] = [];
  let size = 0;
  let cut = false;
  for (const sql of sqls) {
    const t = sql.trimEnd();
    const line = t.endsWith(';') ? t : `${t};`;
    if (size + line.length > SCHEMA_MAX_CHARS) {
      cut = true;
      break;
    }
    parts.push(line);
    size += line.length + 2;
  }
  if (cut) parts.push('-- schema cut at 500 KB');
  const text = parts.join('\n\n');
  return moreTables ? `${text}\n\n-- first ${MAX_TABLES} tables and views only` : text;
}

/**
 * Rows as arrays in SELECT order. Object rows would collapse two columns with the same name (a view that
 * joins two tables on `id`) and shift every cell after them, so arrays are used wherever Node offers them.
 * Returns undefined when object rows cannot be trusted; the caller then shows no rows for that table.
 */
function readRows(select: StatementSync, limit: number, width: number, budget: { text?: number }): DbCell[][] | undefined {
  const arrays = select as unknown as { setReturnArrays?: (on: boolean) => void };
  let raw: unknown[][];
  if (typeof arrays.setReturnArrays === 'function') {
    arrays.setReturnArrays(true);
    raw = select.all(limit) as unknown as unknown[][];
  } else {
    raw = (select.all(limit) as Record<string, unknown>[]).map((r) => Object.values(r));
    if (!raw.every((r) => r.length === width * 2)) return undefined;
  }
  // Each kept column is two values, the value then its typeof(), so the row is read back in pairs.
  const rows: DbCell[][] = [];
  for (const r of raw) {
    const row: DbCell[] = [];
    for (let i = 0; i < width; i++) {
      const cell = cellAt(r[2 * i], r[2 * i + 1]);
      row.push(cell);
      if (typeof cell === 'string') budget.text = (budget.text ?? 0) - cell.length;
    }
    rows.push(row);
    // Once the text budget is spent the table keeps the rows it has; the next table keeps counts only.
    if ((budget.text ?? 0) <= 0) break;
  }
  return rows;
}

/**
 * One table or view with its columns, and its rows when they can be read. A table whose schema pragmas fail
 * (a virtual table whose module is missing, say) keeps no columns and no rows: one bad table must not hide
 * the rest of the file. `budget` is shared across tables and counts the cells still allowed to be read.
 */
export function tableOf(db: DatabaseSync, row: SchemaRow, maxRows: number, budget: { cells: number; text?: number }): DbTable {
  const kind = row.type === 'view' ? 'view' : 'table';
  const q = quote(row.name);
  let info: { name: string; type: string; pk: number; nn: number; hidden: number }[];
  let fks: { tbl: string; from_col: string; to_col: string | null }[];
  try {
    // pragma_table_xinfo, not table_info: table_info omits generated columns, which SELECT * still returns,
    // so the cells would shift under the wrong names. hidden 1 is a virtual table's hidden column, never shown.
    const all = db.prepare('SELECT name, type, pk, "notnull" AS nn, hidden FROM pragma_table_xinfo(?) ORDER BY cid').all(row.name) as typeof info;
    info = all.filter((c) => c.hidden !== 1);
    fks = db.prepare('SELECT "table" AS tbl, "from" AS from_col, "to" AS to_col FROM pragma_foreign_key_list(?)').all(row.name) as typeof fks;
  } catch {
    return { name: row.name, kind, columns: [] };
  }
  const columns: DbColumn[] = info.slice(0, MAX_COLUMNS).map((c) => {
    const col: DbColumn = { name: c.name, type: c.type, pk: c.pk > 0, notNull: c.nn === 1 || c.pk > 0 };
    const fk = fks.find((f) => f.from_col === c.name);
    // A foreign key without a named target column points at the other table's primary key.
    if (fk) col.references = fk.to_col ? `${fk.tbl}.${fk.to_col}` : fk.tbl;
    return col;
  });
  const table: DbTable = { name: row.name, kind, columns };
  if (info.length > MAX_COLUMNS) table.columnsCut = info.length - MAX_COLUMNS;
  // A view runs its SELECT on every count or read, and a recursive view never ends, which would hang the
  // synchronous server. So a view gets its columns only: no count and no rows.
  if (kind === 'view') return table;
  budget.text ??= TEXT_BUDGET;
  try {
    // Counting stops one past the cap: reaching it is the signal that the real count is larger.
    const counted = Number((db.prepare(`SELECT count(*) AS n FROM (SELECT 1 FROM ${q} LIMIT ${COUNT_CAP + 1})`).get() as { n: number | bigint }).n);
    table.rowCount = Math.min(counted, COUNT_CAP);
    if (counted > COUNT_CAP) table.rowCountCapped = true;
    // Never read more rows than the remaining cell budget pays for; the cells are the kept columns only.
    const width = Math.max(1, columns.length);
    const limit = Math.min(maxRows, Math.floor(budget.cells / width));
    if (limit <= 0 || columns.length === 0 || budget.text <= 0) return table;
    const kept = info.slice(0, MAX_COLUMNS);
    // Only the kept columns, by name: SELECT * would also return the generated columns that the list omits.
    // Each column comes as its value (a blob as its length, a long text cut) and its typeof, two values apiece.
    const picks = kept.map((c, i) => {
      const x = quote(c.name);
      return `CASE typeof(${x}) WHEN 'blob' THEN length(${x}) WHEN 'text' THEN substr(${x}, 1, ${MAX_TEXT + 1}) ELSE ${x} END AS v${i}, typeof(${x}) AS t${i}`;
    });
    // readBigInts: an INTEGER beyond 2^53 would otherwise throw and cost the whole table its rows.
    const select = db.prepare(`SELECT ${picks.join(', ')} FROM ${q} LIMIT ?`);
    select.setReadBigInts(true);
    const rows = readRows(select, limit, kept.length, budget);
    if (!rows) return table;
    table.rows = rows;
    budget.cells -= rows.length * columns.length;
  } catch {
    // No rows for this one table; its columns above are still shown.
  }
  return table;
}
