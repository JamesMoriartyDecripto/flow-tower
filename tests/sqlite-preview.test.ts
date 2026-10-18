import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { readTowerFile } from '../src/server/files';
import type { DbTable } from '../src/core/dbPreview';

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
});
