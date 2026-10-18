import { describe, expect, it } from 'vitest';
import { formatCell, rowsLabel, tablesLabel } from '../src/app/hud/DbView';
import type { DbTable } from '../src/core/dbPreview';

describe('formatCell', () => {
  it('shows null as NULL in its own kind', () => {
    expect(formatCell(null)).toEqual({ text: 'NULL', kind: 'null' });
  });
  it('keeps zero as a number, not as empty', () => {
    expect(formatCell(0)).toEqual({ text: '0', kind: 'number' });
  });
  it('keeps negative numbers as numbers', () => {
    expect(formatCell(-3.5)).toEqual({ text: '-3.5', kind: 'number' });
  });
  it('passes strings through as text', () => {
    expect(formatCell('hello')).toEqual({ text: 'hello', kind: 'text' });
  });
});

describe('rowsLabel', () => {
  const base: DbTable = { name: 't', kind: 'table', columns: [] };
  it('says how much of a cut sqlite table is shown', () => {
    const rows = Array.from({ length: 100 }, () => [1]);
    expect(rowsLabel({ ...base, rowCount: 150, rows })).toBe('first 100 of 150 rows');
  });
  it('gives the total when the whole table is shown', () => {
    const rows = [[1], [2], [3]];
    expect(rowsLabel({ ...base, rowCount: 3, rows })).toBe('3 rows');
  });
  it('uses the singular for one row', () => {
    expect(rowsLabel({ ...base, rowCount: 1, rows: [[1]] })).toBe('1 row');
  });
  it('says a sql schema has no data', () => {
    expect(rowsLabel(base)).toBe('schema only: no data in a .sql file');
  });
  it('marks a capped row count as a floor', () => {
    const rows = Array.from({ length: 100 }, () => [1]);
    expect(rowsLabel({ ...base, rowCount: 100000, rowCountCapped: true, rows })).toBe('first 100 of 100,000+ rows');
  });
});

describe('tablesLabel', () => {
  const table: DbTable = { name: 't', kind: 'table', columns: [] };
  it('uses the singular for one table', () => {
    expect(tablesLabel({ source: 'sqlite', tables: [table] })).toBe('1 table · sqlite');
  });
  it('shows how many tables are listed out of the file total', () => {
    expect(tablesLabel({ source: 'sql', tables: [table], tableCount: 40 })).toBe('first 1 of 40 tables · sql');
  });
  it('gives the plain count when every table is listed', () => {
    expect(tablesLabel({ source: 'sqlite', tables: [table, table], tableCount: 2 })).toBe('2 tables · sqlite');
  });
});
