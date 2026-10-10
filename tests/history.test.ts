import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';
import { openHistory } from '../src/server/history/db';
import { toRow } from '../src/server/history/row';
import { migrate } from '../src/server/history/schema';
import { createHistory, retentionDays } from '../src/server/history/store';

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

const ev = (x: object, ts = 1_000_000): FlowEvent => ({ ...FlowEventSchema.parse(x), id: 1, ts, targets: [] });

const rows = (db: DatabaseSync) => db.prepare('SELECT * FROM events').all() as Record<string, unknown>[];

describe('history scrub + writer (#84)', () => {
  it('never copies content: no prompt, path or argument survives into any column', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const secrets = ['/home/u/secret/project/notes.md', 'refactor the auth module', 'rm -rf /tmp/x'];
    const event = ev({
      kind: 'tool.start', sender: 'alice', user: 'alice', tool: 'Bash', model: 'gpt-5', tokens: 120, cost_usd: 0.5,
      message: secrets[1], prompt: secrets[1], path: secrets[0], command: secrets[2], arguments: { command: secrets[2] },
      data: { prompt: secrets[1], file_path: secrets[0], command: secrets[2] },
    });
    createHistory(res.db).write([event]);
    const raw = rows(res.db);
    expect(raw).toHaveLength(1);
    const flat = JSON.stringify(raw[0]);
    for (const s of secrets) expect(flat).not.toContain(s);
    // Nothing that looks like a prompt/path column exists at all: the row is the allow-listed set only.
    expect(Object.keys(raw[0]).sort()).toEqual(['auto', 'cache_read', 'cache_write', 'cost_usd_micros', 'duration_ms', 'estimated', 'event_key', 'host', 'id', 'in_tok', 'kind', 'model', 'out_tok', 'project', 'runtime', 'sender', 'session', 'status', 'tool', 'ts', 'user']);
    expect((raw[0] as { cost_usd_micros: number }).cost_usd_micros).toBe(500_000);
  });

  it('keeps totals across closing and reopening the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-history-'));
    const path = join(dir, 'history.db');
    const first = await openHistory(path);
    if ('disabled' in first) return;
    createHistory(first.db).write([ev({ kind: 'usage', user: 'alice', tokens_detail: { input: 10, output: 5 }, cost_usd: 0.25, status: 'error' })]);
    first.db.close();

    const second = await openHistory(path);
    if ('disabled' in second) return;
    const totals = second.db.prepare('SELECT events, errors, in_tok, out_tok, cost_usd_micros FROM rollup_hourly').all() as Record<string, number>[];
    expect(totals).toEqual([{ events: 1, errors: 1, in_tok: 10, out_tok: 5, cost_usd_micros: 250_000 }]);
  });

  it('counts a duplicate event_key once in events and once in the rollups', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const history = createHistory(res.db);
    const e = ev({ kind: 'usage', sender: 'alice', user: 'alice', model: 'gpt-5', tokens: 7, call: 'call_1' });
    history.write([e, { ...e, id: 2 }]);
    expect(rows(res.db)).toHaveLength(1);
    const rollup = res.db.prepare('SELECT events, in_tok FROM rollup_hourly').all();
    expect(rollup).toEqual([{ events: 1, in_tok: 7 }]);
  });

  it('lets an event without any id through (no dedupe key) rather than dropping it', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const history = createHistory(res.db);
    history.write([ev({ kind: 'log' }, 5_000_000), ev({ kind: 'log' }, 5_000_001)]);
    expect(rows(res.db)).toHaveLength(2);
    expect(toRow(ev({ kind: 'log' }), 1_000_000)?.event_key).toBeNull();
  });
});

const DAY = 24 * 3_600_000;

describe('history retention (#84)', () => {
  const seeded = async (now: number) => {
    const res = await open();
    if ('disabled' in res) return res;
    const history = createHistory(res.db);
    // One event and one bucket exactly at each table's limit, and one just past it.
    const seed = (table: string, col: string, ageDays: number) =>
      res.db.prepare(`INSERT INTO ${table} (${col}) VALUES (?)`).run(now - ageDays * DAY);
    seed('events', 'ts', 14);
    seed('events', 'ts', 15);
    seed('rollup_hourly', 'bucket', 90);
    seed('rollup_hourly', 'bucket', 91);
    seed('rollup_daily', 'bucket', 395);
    seed('rollup_daily', 'bucket', 396);
    history.prune(now, { rawDays: 14 });
    const count = (table: string) => (res.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    return { res, count };
  };

  it('prunes each table at its own limit', async () => {
    const now = 1_700_000_000_000;
    const s = await seeded(now);
    if ('disabled' in s) return expect(s.disabled).toContain('Node >= 22.13');
    expect(s.count('events')).toBe(1);
    expect(s.count('rollup_hourly')).toBe(1);
    expect(s.count('rollup_daily')).toBe(1);
  });

  it('clamps FLOW_TOWER_RETENTION_DAYS to 1..21', () => {
    expect(retentionDays('30')).toBe(21);
    expect(retentionDays('0')).toBe(1);
    expect(retentionDays('7')).toBe(7);
    expect(retentionDays(undefined)).toBe(14);
    expect(retentionDays('nonsense')).toBe(14);
  });
});
