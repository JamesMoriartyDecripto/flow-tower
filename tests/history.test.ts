import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openHistory } from '../src/server/history/db';
import { migrate } from '../src/server/history/schema';

/**
 * History DB (#84). The file lives in a temp folder here, standing in for userHome(), never the repo.
 * node:sqlite may be absent on an old Node: the module reports that, so the tests are skipped rather
 * than failing where the feature is not available.
 */
const open = () => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-history-'));
  return openHistory(join(dir, 'history.db'));
};

const names = (db: DatabaseSync) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name).sort();

const version = (db: DatabaseSync) =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

describe('history schema (#84)', () => {
  it('creates the events and rollup tables on a fresh file', async () => {
    const res = await open();
    if ('disabled' in res) return expect(res.disabled).toContain('Node >= 22.13');
    expect(names(res.db)).toEqual(['events', 'rollup_daily', 'rollup_hourly']);
  });

  it('is idempotent: migrating twice keeps the version and the tables', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const before = names(res.db);
    migrate(res.db);
    expect(names(res.db)).toEqual(before);
    expect(version(res.db)).toBe(1);
  });

  it('sets user_version and locks the file down', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-history-'));
    const path = join(dir, 'history.db');
    const res = await openHistory(path);
    if ('disabled' in res) return;
    expect(version(res.db)).toBe(1);
    // 0600 where the file system honours chmod (matches the token store's best-effort mode).
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('keys the rollups on NOT NULL columns, so NULL users cannot duplicate a row', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const cols = res.db.prepare('PRAGMA table_info(rollup_hourly)').all() as { name: string; notnull: number; pk: number }[];
    for (const c of ['bucket', 'user', 'project', 'runtime', 'model']) {
      const col = cols.find((x) => x.name === c)!;
      expect(col.notnull, c).toBe(1);
      expect(col.pk, c).toBeGreaterThan(0);
    }
    expect(cols.some((c) => c.name === 'cost_usd_micros')).toBe(true);
  });
});
