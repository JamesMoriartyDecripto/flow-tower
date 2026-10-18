/**
 * Previews a SQLite database for the file viewer (#264): its schema as text, and the first rows of each
 * table and view. The file is opened read-only and only ever read, so looking at a database cannot change it.
 * node:sqlite is imported dynamically, as history/db.ts does, so a Node without it gets a clear error here
 * instead of failing at load.
 */
import { open } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import type { DbCell, DbColumn, DbPreview, DbTable } from '../core/dbPreview.ts';

const HEADER = 'SQLite format 3\0';
/** Tables and views listed per database: a schema with thousands of tables would make the preview unreadable. */
const MAX_TABLES = 200;
/** Long text cells are cut: the preview is for reading, not for moving data out of the file. */
const MAX_TEXT = 500;
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

type SchemaRow = { type: string; name: string; sql: string | null };

/**
 * Reads one database. Only SELECTs run, on a connection opened read-only; the caller gets either the
 * preview or a reason it could not be read (a corrupt or locked file, for instance).
 */
export async function readSqlitePreview(abs: string, maxRows = 100): Promise<{ content: string; db: DbPreview } | { error: string }> {
  let sqlite: typeof import('node:sqlite');
  try {
    sqlite = await import('node:sqlite');
  } catch {
    return { error: NEEDS_NODE };
  }
  if (typeof sqlite.DatabaseSync !== 'function') return { error: NEEDS_NODE };
  let db: DatabaseSync | undefined;
  try {
    db = new sqlite.DatabaseSync(abs, { readOnly: true });
    const schema = db
      .prepare("SELECT type, name, sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY rowid")
      .all() as SchemaRow[];
    const cut = schema.length > MAX_TABLES;
    const tables = schema.slice(0, MAX_TABLES).map((r) => tableOf(db!, r, maxRows));
    // Every statement of the schema, indexes and triggers included, so the text is the whole picture.
    const statements = db.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid').all() as { sql: string }[];
    const lines = statements.map((r) => (r.sql.trimEnd().endsWith(';') ? r.sql.trimEnd() : `${r.sql.trimEnd()};`));
    const content = cut ? `${lines.join('\n\n')}\n\n-- first ${MAX_TABLES} tables and views only` : lines.join('\n\n');
    return { content, db: { source: 'sqlite', tables } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    db?.close();
  }
}

/**
 * One table or view with its columns, and its rows when they can be read. A table that fails (a virtual
 * table whose module is missing, say) keeps its columns and loses only the rows: one bad table must not
 * hide the rest of the file.
 */
function tableOf(db: DatabaseSync, row: SchemaRow, maxRows: number): DbTable {
  const q = quote(row.name);
  const info = db.prepare('SELECT name, type, pk, "notnull" AS nn FROM pragma_table_info(?) ORDER BY cid').all(row.name) as
    { name: string; type: string; pk: number; nn: number }[];
  const fks = db.prepare('SELECT "table" AS tbl, "from" AS from_col, "to" AS to_col FROM pragma_foreign_key_list(?)').all(row.name) as
    { tbl: string; from_col: string; to_col: string | null }[];
  const columns: DbColumn[] = info.map((c) => {
    const col: DbColumn = { name: c.name, type: c.type, pk: c.pk > 0, notNull: c.nn === 1 || c.pk > 0 };
    const fk = fks.find((f) => f.from_col === c.name);
    // A foreign key without a named target column points at the other table's primary key.
    if (fk) col.references = fk.to_col ? `${fk.tbl}.${fk.to_col}` : fk.tbl;
    return col;
  });
  const table: DbTable = { name: row.name, kind: row.type === 'view' ? 'view' : 'table', columns };
  try {
    const rowCount = (db.prepare(`SELECT count(*) AS n FROM ${q}`).get() as { n: number | bigint }).n;
    // readBigInts: an INTEGER beyond 2^53 would otherwise throw and cost the whole table its rows.
    const select = db.prepare(`SELECT * FROM ${q} LIMIT ?`);
    select.setReadBigInts(true);
    const rows = select.all(maxRows) as Record<string, unknown>[];
    table.rowCount = Number(rowCount);
    // Object values keep the column order of SELECT *, which is the order the viewer shows.
    table.rows = rows.map((r) => Object.values(r).map(cellOf));
  } catch {
    // No rows for this one table; its columns above are still shown.
  }
  return table;
}
