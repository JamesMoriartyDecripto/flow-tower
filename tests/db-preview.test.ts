import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSqlSchema } from '../src/core/dbPreview.ts';

const schema = readFileSync('examples/mobile-studio/backend/schema.sql', 'utf8');

describe('parseSqlSchema on the Leafwise schema', () => {
  const tables = parseSqlSchema(schema);

  it('lists the three tables first, in file order', () => {
    expect(tables.slice(0, 3).map((t) => t.name)).toEqual([
      'public.profiles',
      'public.plants',
      'public.care_events',
    ]);
    expect(tables.slice(0, 3).every((t) => t.kind === 'table')).toBe(true);
  });

  it('reads the plants columns in order', () => {
    const plants = tables.find((t) => t.name === 'public.plants')!;
    expect(plants.columns.map((c) => c.name)).toEqual([
      'id',
      'owner_id',
      'name',
      'species',
      'pot_size_cm',
      'light',
      'summer_interval_days',
      'photo_path',
      'created_at',
    ]);
    const byName = (n: string) => plants.columns.find((c) => c.name === n)!;
    expect(byName('id')).toMatchObject({ type: 'uuid', pk: true, notNull: true });
    expect(byName('owner_id')).toMatchObject({
      notNull: true,
      references: 'public.profiles.id',
    });
    expect(byName('species').notNull).toBe(false);
    expect(byName('pot_size_cm').type).toBe('int');
  });

  it('does not throw on the whole file and never returns rows', () => {
    for (const t of tables) {
      expect(t.rows).toBeUndefined();
      expect(t.rowCount).toBeUndefined();
    }
  });
});

describe('parseSqlSchema on SQLite', () => {
  const sql = `CREATE TABLE IF NOT EXISTS "cards" (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'new', note, price NUMERIC(10, 2), PRIMARY KEY (id));
CREATE VIEW open_cards AS SELECT * FROM cards WHERE status = 'new';`;

  it('reads the table and then the view', () => {
    const tables = parseSqlSchema(sql);
    expect(tables.map((t) => [t.name, t.kind])).toEqual([
      ['cards', 'table'],
      ['open_cards', 'view'],
    ]);
    const cols = tables[0].columns;
    expect(cols.find((c) => c.name === 'note')!.type).toBe('');
    expect(cols.find((c) => c.name === 'price')!.type).toBe('NUMERIC(10, 2)');
    expect(cols.find((c) => c.name === 'id')).toMatchObject({ pk: true, notNull: true });
    expect(cols.find((c) => c.name === 'status')).toMatchObject({ type: 'TEXT', notNull: true });
    expect(tables[1].columns).toEqual([]);
  });
});

describe('parseSqlSchema keys and references', () => {
  it('applies table-level primary and foreign keys', () => {
    const [t] = parseSqlSchema(
      'create table m (a int, b int, primary key (a, b), foreign key (b) references t (id))',
    );
    expect(t.columns.find((c) => c.name === 'a')).toMatchObject({ pk: true, notNull: true });
    expect(t.columns.find((c) => c.name === 'b')).toMatchObject({
      pk: true,
      notNull: true,
      references: 't.id',
    });
  });

  it('keeps a quoted name with spaces and a bare reference', () => {
    const [t] = parseSqlSchema('create table "my table" (x int references other)');
    expect(t.name).toBe('my table');
    expect(t.columns[0].references).toBe('other');
  });

  it('keeps a comma inside a parenthesised check and a quoted string intact', () => {
    const [t] = parseSqlSchema(
      "create table p (c text check (c in ('a', 'b')), d text default 'a, b) -- not a comment', e int)",
    );
    expect(t.columns.map((c) => c.name)).toEqual(['c', 'd', 'e']);
    expect(t.columns[1].type).toBe('text');
  });
});

describe('parseSqlSchema comments and garbage', () => {
  it('ignores tables inside line and block comments', () => {
    const sql = '-- create table fake (x int)\n/* create table fake2 (y int) */\ncreate table real (z int);';
    expect(parseSqlSchema(sql).map((t) => t.name)).toEqual(['real']);
  });

  it('does not treat -- inside a string as a comment', () => {
    const [t] = parseSqlSchema("create table s (v text default 'it''s -- fine', w int)");
    expect(t.columns.map((c) => c.name)).toEqual(['v', 'w']);
  });

  it('returns an empty list for input it cannot read', () => {
    expect(parseSqlSchema('not sql at all')).toEqual([]);
    expect(parseSqlSchema('')).toEqual([]);
    expect(parseSqlSchema('create table broken (')).toEqual([]);
  });
});
