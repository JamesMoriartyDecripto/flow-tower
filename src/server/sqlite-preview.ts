/**
 * Previews a SQLite database for the file viewer (#264): its schema as text, and the first rows of each
 * table and view. The file is opened read-only and only ever read, so looking at a database cannot change it.
 * node:sqlite is imported dynamically (importSqlite, shared with history/db.ts), so a Node without it gets a
 * clear error here instead of failing at load.
 */
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
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
  if (v instanceof Uint8Array) return `<blob ${v.byteLength} bytes>`;
  const s = String(v);
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
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
  try {
    db = new sqlite.DatabaseSync(abs, { readOnly: true });
    const schema = db
      .prepare("SELECT type, name, sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY rowid")
      .all() as SchemaRow[];
    const budget = { cells: CELL_BUDGET };
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
function readRows(select: StatementSync, limit: number, fullWidth: number): unknown[][] | undefined {
  const arrays = select as unknown as { setReturnArrays?: (on: boolean) => void };
  if (typeof arrays.setReturnArrays === 'function') {
    arrays.setReturnArrays(true);
    return select.all(limit) as unknown as unknown[][];
  }
  const rows = (select.all(limit) as Record<string, unknown>[]).map((r) => Object.values(r));
  return rows.every((r) => r.length === fullWidth) ? rows : undefined;
}

/**
 * One table or view with its columns, and its rows when they can be read. A table whose schema pragmas fail
 * (a virtual table whose module is missing, say) keeps no columns and no rows: one bad table must not hide
 * the rest of the file. `budget` is shared across tables and counts the cells still allowed to be read.
 */
export function tableOf(db: DatabaseSync, row: SchemaRow, maxRows: number, budget: { cells: number }): DbTable {
  const kind = row.type === 'view' ? 'view' : 'table';
  const q = quote(row.name);
  let info: { name: string; type: string; pk: number; nn: number }[];
  let fks: { tbl: string; from_col: string; to_col: string | null }[];
  try {
    info = db.prepare('SELECT name, type, pk, "notnull" AS nn FROM pragma_table_info(?) ORDER BY cid').all(row.name) as typeof info;
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
  try {
    // Counting stops one past the cap: reaching it is the signal that the real count is larger.
    const counted = Number((db.prepare(`SELECT count(*) AS n FROM (SELECT 1 FROM ${q} LIMIT ${COUNT_CAP + 1})`).get() as { n: number | bigint }).n);
    table.rowCount = Math.min(counted, COUNT_CAP);
    if (counted > COUNT_CAP) table.rowCountCapped = true;
    // Never read more rows than the remaining cell budget pays for; the cells are the kept columns only.
    const width = Math.max(1, columns.length);
    const limit = Math.min(maxRows, Math.floor(budget.cells / width));
    if (limit <= 0 || columns.length === 0) return table;
    // readBigInts: an INTEGER beyond 2^53 would otherwise throw and cost the whole table its rows.
    const select = db.prepare(`SELECT * FROM ${q} LIMIT ?`);
    select.setReadBigInts(true);
    const rows = readRows(select, limit, info.length);
    if (!rows) return table;
    table.rows = rows.map((r) => r.slice(0, columns.length).map(cellOf));
    budget.cells -= table.rows.length * columns.length;
  } catch {
    // No rows for this one table; its columns above are still shown.
  }
  return table;
}
