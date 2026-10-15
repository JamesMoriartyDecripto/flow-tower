import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSqliteExperimentalWarning, openHistory } from '../src/server/history/db';

describe('isSqliteExperimentalWarning (#211)', () => {
  it('matches the SQLite experimental notice by type argument', () => {
    expect(isSqliteExperimentalWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning')).toBe(true);
  });

  it('matches an Error whose name is ExperimentalWarning', () => {
    const err = new Error('SQLite is an experimental feature and might change at any time');
    err.name = 'ExperimentalWarning';
    expect(isSqliteExperimentalWarning(err)).toBe(true);
  });

  it('leaves other experimental warnings alone', () => {
    expect(isSqliteExperimentalWarning('Fetch is experimental', 'ExperimentalWarning')).toBe(false);
  });

  it('leaves other warning types alone even when they mention SQLite', () => {
    expect(isSqliteExperimentalWarning('SQLite is deprecated here', 'DeprecationWarning')).toBe(false);
  });

  it('is false for undefined', () => {
    expect(isSqliteExperimentalWarning(undefined)).toBe(false);
  });
});

describe('openHistory warning filter (#211)', () => {
  it('restores process.emitWarning after opening', async () => {
    const before = process.emitWarning;
    const path = join(mkdtempSync(join(tmpdir(), 'flow-tower-warn-')), 'history.db');
    await openHistory(path);
    expect(process.emitWarning).toBe(before);
  });
});
