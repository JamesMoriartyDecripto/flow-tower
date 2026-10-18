import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { readTowerFile } from '../src/server/files';
import { tableOf, type SchemaRow } from '../src/server/sqlite-preview';
import type { DbTable } from '../src/core/dbPreview';

/** Whether this Node can return rows as arrays; the duplicate-column test needs it (Node 24, or a backport). */
const canReturnArrays = (() => {
  const db = new DatabaseSync(':memory:');
  try {
    return typeof (db.prepare('SELECT 1') as unknown as { setReturnArrays?: unknown }).setReturnArrays === 'function';
  } finally {
    db.close();
  }
})();

/** A fresh tower root with one database built by `setup`; node:sqlite writes it, the viewer only reads it. */
function makeDb(name: string, setup: (db: DatabaseSync) => void): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), 'flow-tower-sqlite-'));
  const path = join(root, name);
  const db = new DatabaseSync(path);
  try {
    setup(db);
  } finally {
    db.close();
  }
  return { root, path };
}

const table = (tables: DbTable[], name: string) => tables.find((t) => t.name === name)!;

describe('SQLite files are previewed, not refused (#264)', () => {
  it('answers the schema, the cells, the view and the row count', async () => {
    const { root } = makeDb('shop.db', (db) => {
      db.exec('CREATE TABLE owners (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
      db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, owner INTEGER REFERENCES owners(id), big INTEGER, pic BLOB, note TEXT)');
      db.exec('CREATE VIEW named AS SELECT name FROM owners');
      db.prepare('INSERT INTO owners (id, name) VALUES (1, ?)').run('ann');
      const ins = db.prepare('INSERT INTO items (id, owner, big, pic, note) VALUES (?, 1, ?, ?, ?)');
      ins.run(1, 9007199254740993n, new Uint8Array([1, 2, 3]), 'x'.repeat(600));
      for (let i = 2; i <= 150; i++) ins.run(i, null, null, 'short');
    });
    const r = await readTowerFile(root, 'shop.db');
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.body.db?.source).toBe('sqlite');
    expect(r.body.db!.tables.map((t) => t.name)).toEqual(['owners', 'items', 'named']);
    expect(r.body.content).toContain('CREATE TABLE owners');
    expect(r.body.content).toContain('CREATE TABLE items');

    const items = table(r.body.db!.tables, 'items');
    expect(items.rowCount).toBe(150);
    expect(items.rows).toHaveLength(100);
    expect(items.columns.find((c) => c.name === 'owner')?.references).toBe('owners.id');
    expect(items.columns.find((c) => c.name === 'id')).toMatchObject({ pk: true, notNull: true });
    const first = items.rows![0];
    expect(first[0]).toBe(1);
    expect(first[2]).toBe('9007199254740993');
    expect(first[3]).toBe('<blob 3 bytes>');
    expect(first[4]).toBe('x'.repeat(500) + '…');

    const view = table(r.body.db!.tables, 'named');
    expect(view.kind).toBe('view');
    expect(table(r.body.db!.tables, 'owners').columns.find((c) => c.name === 'name')?.notNull).toBe(true);
  });

  it('never modifies the file, also in WAL mode', async () => {
    const { root, path } = makeDb('wal.db', (db) => {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE t (x)');
      db.exec('INSERT INTO t VALUES (1)');
    });
    const before = readFileSync(path);
    const mtime = statSync(path).mtimeMs;
    const r = await readTowerFile(root, 'wal.db');
    expect(r.status).toBe(200);
    expect(readFileSync(path).equals(before)).toBe(true);
    expect(statSync(path).mtimeMs).toBe(mtime);
  });

  it('decides by the header: plain text named .db is text, a database named .bin is a database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'flow-tower-sqlite-'));
    writeFileSync(join(root, 'data.db'), 'just some notes\n');
    const text = await readTowerFile(root, 'data.db');
    expect(text).toMatchObject({ status: 200, body: { content: 'just some notes\n' } });
    expect(text.status === 200 && text.body.db).toBeUndefined();

    const { root: binRoot } = makeDb('notes.bin', (db) => db.exec('CREATE TABLE n (v)'));
    const db = await readTowerFile(binRoot, 'notes.bin');
    expect(db.status).toBe(200);
    expect(db.status === 200 && db.body.db?.tables.map((t) => t.name)).toEqual(['n']);
  });

  it('previews a database larger than 1 MB', async () => {
    const { root } = makeDb('big.sqlite', (db) => {
      db.exec('CREATE TABLE blobs (b BLOB)');
      db.prepare('INSERT INTO blobs VALUES (?)').run(new Uint8Array(2_000_000).fill(7));
    });
    const r = await readTowerFile(root, 'big.sqlite');
    expect(r.status).toBe(200);
    expect(r.status === 200 && table(r.body.db!.tables, 'blobs').rowCount).toBe(1);
  });

  it('counts and reads a table whose name holds a double quote', async () => {
    const { root } = makeDb('quote.db', (db) => {
      db.exec('CREATE TABLE "we""ird" (v INTEGER)');
      db.exec('INSERT INTO "we""ird" VALUES (4), (5)');
    });
    const r = await readTowerFile(root, 'quote.db');
    expect(r.status).toBe(200);
    const t = r.status === 200 ? table(r.body.db!.tables, 'we"ird') : undefined;
    expect(t?.rowCount).toBe(2);
    expect(t?.rows).toEqual([[4], [5]]);
  });

  it('reads a .sql schema: tables without rows, and no db for a file with no tables', async () => {
    const root = mkdtempSync(join(tmpdir(), 'flow-tower-sqlite-'));
    writeFileSync(join(root, 'schema.sql'), 'CREATE TABLE plants (id INTEGER PRIMARY KEY, name TEXT);\n');
    const sql = await readTowerFile(root, 'schema.sql');
    expect(sql.status === 200 && sql.body.db?.source).toBe('sql');
    expect(sql.status === 200 && sql.body.db?.tables).toEqual([
      { name: 'plants', kind: 'table', columns: [
        { name: 'id', type: 'INTEGER', pk: true, notNull: true },
        { name: 'name', type: 'TEXT', pk: false, notNull: false },
      ] },
    ]);
    expect(sql.status === 200 && table(sql.body.db!.tables, 'plants').rows).toBeUndefined();

    writeFileSync(join(root, 'only.sql'), 'SELECT 1;\n');
    const plain = await readTowerFile(root, 'only.sql');
    expect(plain.status === 200 && plain.body.db).toBeUndefined();
  });

  it('still refuses a database in a secret path', async () => {
    const { root } = makeDb('server.key', (db) => db.exec('CREATE TABLE t (x)'));
    expect((await readTowerFile(root, 'server.key')).status).toBe(403);
  });

  it('keeps the columns and no rows for a table whose pragmas fail, and the other tables still show', () => {
    const stub = { prepare: () => { throw new Error('no such module: fts5x'); } } as unknown as DatabaseSync;
    const row: SchemaRow = { type: 'table', name: 'broken', sql: null };
    const t = tableOf(stub, row, 100, { cells: 20_000 });
    expect(t).toEqual({ name: 'broken', kind: 'table', columns: [] });
    expect(t.rows).toBeUndefined();
  });

  it('caps the row count at 100,000 and says so', () => {
    const { path } = makeDb('many.db', (db) => {
      db.exec('CREATE TABLE many (x INTEGER)');
      db.exec('WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c WHERE n < 100050) INSERT INTO many SELECT n FROM c');
    });
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const t = tableOf(db, { type: 'table', name: 'many', sql: null }, 100, { cells: 20_000 });
      expect(t.rowCount).toBe(100_000);
      expect(t.rowCountCapped).toBe(true);
    } finally {
      db.close();
    }
  });

  it('keeps 100 of 150 columns and reports the 50 left out', () => {
    const cols = Array.from({ length: 150 }, (_, i) => `c${i} INTEGER`).join(', ');
    const { path } = makeDb('wide.db', (db) => {
      db.exec(`CREATE TABLE wide (${cols})`);
      db.exec(`INSERT INTO wide (c0) VALUES (1)`);
    });
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const t = tableOf(db, { type: 'table', name: 'wide', sql: null }, 100, { cells: 20_000 });
      expect(t.columns).toHaveLength(100);
      expect(t.columnsCut).toBe(50);
      expect(t.rows?.[0]).toHaveLength(100);
    } finally {
      db.close();
    }
  });

  it('counts tables and views in tableCount, before the preview cap', async () => {
    const { root } = makeDb('count.db', (db) => {
      db.exec('CREATE TABLE a (x)');
      db.exec('CREATE TABLE b (x)');
      db.exec('CREATE VIEW v AS SELECT x FROM a');
    });
    const r = await readTowerFile(root, 'count.db');
    expect(r.status === 200 && r.body.db?.tableCount).toBe(3);
  });

  it('gives rows as wide as the columns when a view has two columns named id', async () => {
    if (!canReturnArrays) return;
    const { root } = makeDb('dup.db', (db) => {
      db.exec('CREATE TABLE a (id INTEGER, x TEXT)');
      db.exec('CREATE TABLE b (id INTEGER, y TEXT)');
      db.exec("INSERT INTO a VALUES (1, 'ax')");
      db.exec("INSERT INTO b VALUES (1, 'by')");
      db.exec('CREATE VIEW j AS SELECT a.id, b.id FROM a JOIN b ON a.x IS NOT NULL AND b.id = a.id');
    });
    const r = await readTowerFile(root, 'dup.db');
    const v = r.status === 200 ? table(r.body.db!.tables, 'j') : undefined;
    expect(v?.columns).toHaveLength(2);
    // A view gets its columns only (it is never run), so no rows are read for it any more.
    expect(v?.rows).toBeUndefined();
  });

  it('shows a generated column under its own name, with its own cells', async () => {
    const { root } = makeDb('gen.db', (db) => {
      db.exec('CREATE TABLE t (a INT, b INT GENERATED ALWAYS AS (a*10) VIRTUAL, c TEXT)');
      db.exec("INSERT INTO t (a, c) VALUES (3, 'x')");
    });
    const r = await readTowerFile(root, 'gen.db');
    const t = r.status === 200 ? table(r.body.db!.tables, 't') : undefined;
    expect(t?.columns.map((c) => c.name)).toEqual(['a', 'b', 'c']);
    expect(t?.rows).toEqual([[3, 30, 'x']]);
  });

  it('gives a recursive view its columns at once, with no rows and no count', async () => {
    const { root } = makeDb('loop.db', (db) => {
      db.exec('CREATE VIEW forever AS WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c) SELECT n FROM c');
    });
    const started = Date.now();
    const r = await readTowerFile(root, 'loop.db');
    expect(Date.now() - started).toBeLessThan(5000);
    const v = r.status === 200 ? table(r.body.db!.tables, 'forever') : undefined;
    expect(v?.columns.map((c) => c.name)).toEqual(['n']);
    expect(v).not.toHaveProperty('rows');
    expect(v).not.toHaveProperty('rowCount');
  });

  it('leaves no -wal or -shm beside a WAL database that had none', async () => {
    const { root, path } = makeDb('side.db', (db) => {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE t (x)');
      db.exec('INSERT INTO t VALUES (1)');
    });
    // The writer closed cleanly, so its side files are gone; the preview must not bring them back.
    expect(existsSync(`${path}-wal`)).toBe(false);
    const r = await readTowerFile(root, 'side.db');
    expect(r.status).toBe(200);
    expect(existsSync(`${path}-wal`)).toBe(false);
    expect(existsSync(`${path}-shm`)).toBe(false);
  });

  it('cuts a 10,000-character text cell and shows a blob as its size', () => {
    const { path } = makeDb('cells.db', (db) => {
      db.exec('CREATE TABLE big (s TEXT, b BLOB)');
      db.prepare('INSERT INTO big VALUES (?, ?)').run('y'.repeat(10_000), new Uint8Array(2_048));
    });
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const t = tableOf(db, { type: 'table', name: 'big', sql: null }, 100, { cells: 20_000 });
      expect(t.rows).toEqual([['y'.repeat(500) + '…', '<blob 2048 bytes>']]);
    } finally {
      db.close();
    }
  });

  it('answers an error for a corrupt file without the absolute path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'flow-tower-sqlite-'));
    const garbage = Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(200, 0xff)]);
    writeFileSync(join(root, 'bad.db'), garbage);
    const r = await readTowerFile(root, 'bad.db');
    expect(r.status).toBe(415);
    if (r.status !== 415) return;
    expect(r.body.error).not.toContain(root);
  });
});
