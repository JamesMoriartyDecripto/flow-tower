import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';
import { historyHandler } from '../src/server/history/api';
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
    // WAL sidecars hold the same telemetry, so they are locked down too when they exist.
    for (const suffix of ['-wal', '-shm']) {
      const file = `${path}${suffix}`;
      if (existsSync(file)) expect(statSync(file).mode & 0o777, suffix).toBe(0o600);
    }
  });

  it("stores '' (never NULL) for a missing user, host, runtime or project", async () => {
    const res = await open();
    if ('disabled' in res) return;
    createHistory(res.db).write([ev({ kind: 'log' })]);
    const [row] = rows(res.db);
    for (const col of ['user', 'host', 'runtime', 'project']) expect(row[col], col).toBe('');
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

  it('reads the flat token fields out of data when tokens_detail is absent', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const history = createHistory(res.db);
    // Codex's spelling (`cached_tokens`) for cache_read, Claude's for the cache write, plus a string count.
    history.write([ev({ kind: 'usage', user: 'alice', data: { input_tokens: 1200, output_tokens: 300, cached_tokens: '40', cache_creation_tokens: 7 } })]);
    const [row] = rows(res.db);
    expect(row).toMatchObject({ in_tok: 1200, out_tok: 300, cache_read: 40, cache_write: 7 });
    const rollup = res.db.prepare('SELECT in_tok, out_tok, cache_read, cache_write FROM rollup_hourly').all();
    expect(rollup).toEqual([{ in_tok: 1200, out_tok: 300, cache_read: 40, cache_write: 7 }]);
  });

  it('falls back to the bare tokens total when data holds nothing usable', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const history = createHistory(res.db);
    history.write([ev({ kind: 'usage', tokens: 50, data: { note: 'no counts here' } })]);
    expect(rows(res.db)[0]).toMatchObject({ in_tok: 50, out_tok: 0 });
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

describe('history queries (#84 phase 4)', () => {
  /** Two events, two users, two projects: enough to tell a group-by from a plain sum. */
  const seeded = async () => {
    const res = await open();
    if ('disabled' in res) return res;
    const ts = 1_700_000_000_000;
    createHistory(res.db).write([
      ev({ kind: 'usage', user: 'alice', project: 'tower', runtime: 'claude', tokens_detail: { input: 10, output: 5, cache_read: 2 }, cost_usd: 0.25, status: 'error' }, ts),
      ev({ kind: 'usage', user: 'bob', project: 'other', runtime: 'codex', tokens_detail: { input: 1, output: 1 }, cost_usd: 0.5 }, ts + 1),
      ev({ kind: 'usage', user: 'alice', project: 'tower', runtime: 'claude', tokens: 7, cost_usd: 0.25 }, ts + 2),
    ]);
    return { res, ts, history: createHistory(res.db) };
  };

  it('totals groups by user and sums each column', async () => {
    const s = await seeded();
    if ('disabled' in s) return expect(s.disabled).toContain('Node >= 22.13');
    const rows = s.history.totals({ from: s.ts, to: s.ts + 1000, by: ['user'] });
    expect(rows).toEqual([
      { user: 'alice', events: 2, errors: 1, in_tok: 17, out_tok: 5, cache_read: 2, cache_write: 0, cost_usd: 0.5 },
      { user: 'bob', events: 1, errors: 0, in_tok: 1, out_tok: 1, cache_read: 0, cache_write: 0, cost_usd: 0.5 },
    ]);
  });

  it('totals groups by project and runtime together', async () => {
    const s = await seeded();
    if ('disabled' in s) return;
    const rows = s.history.totals({ from: s.ts, to: s.ts + 1000, by: ['project', 'runtime'] });
    expect(rows.map((r) => [r.project, r.runtime, r.events])).toEqual([['other', 'codex', 1], ['tower', 'claude', 2]]);
  });

  it('reads the hourly rollup inside 90 days and the daily one beyond it', async () => {
    const a = await seeded();
    if ('disabled' in a) return;
    // A marker in rollup_daily: if a short range answered from it, the sums would be wrong.
    a.res.db.exec('UPDATE rollup_daily SET events = 999, in_tok = 999');
    const within = a.history.totals({ from: a.ts, to: a.ts + 1000, by: [] });
    expect(within).toEqual([{ events: 3, errors: 1, in_tok: 18, out_tok: 6, cache_read: 2, cache_write: 0, cost_usd: 1 }]);

    const b = await seeded();
    if ('disabled' in b) return;
    // Past 90 days the hourly rows are pruned, so a long range must fall back to rollup_daily.
    b.res.db.exec('DELETE FROM rollup_hourly');
    const beyond = b.history.totals({ from: b.ts, to: b.ts + 100 * DAY, by: [] });
    expect(beyond).toEqual([{ events: 3, errors: 1, in_tok: 18, out_tok: 6, cache_read: 2, cache_write: 0, cost_usd: 1 }]);
  });
});

/** Minimal request/response doubles: the handlers only read the URL and the headers and call end(). */
const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers }) as never;
const res = () => {
  const out = { status: 0, body: undefined as unknown };
  return {
    out,
    setHeader: () => undefined,
    end: (b: string) => { out.body = b === '' ? undefined : JSON.parse(b); },
    get statusCode() { return out.status; },
    set statusCode(v: number) { out.status = v; },
  } as unknown as ServerResponse & { out: { status: number; body: unknown } };
};

describe('history API (#84 phase 4)', () => {
  const call = (handler: (rq: IncomingMessage, rs: ServerResponse) => void, url: string) => {
    const r = res();
    handler(req(url), r);
    return r.out;
  };

  it('answers the disabled shape as 200, not an error', () => {
    const h = historyHandler(undefined);
    expect(call(h.totals, '/api/history')).toEqual({ status: 200, body: { disabled: expect.stringContaining('Node >= 22.13') } });
    expect(call(h.info, '/api/history/info')).toEqual({ status: 200, body: { disabled: expect.stringContaining('Node >= 22.13') } });
  });

  it('rejects an unknown by with 400 and names the allow-list', async () => {
    const opened = await open();
    if ('disabled' in opened) return;
    const h = historyHandler(createHistory(opened.db));
    const out = call(h.totals, '/api/history?by=user,password');
    expect(out.status).toBe(400);
    expect(JSON.stringify(out.body)).toContain('password');
    expect(call(h.totals, '/api/history?by=user,project').status).toBe(200);
  });

  it('clamps a negative from/to to 0 instead of rejecting it', async () => {
    const opened = await open();
    if ('disabled' in opened) return;
    const h = historyHandler(createHistory(opened.db));
    const body = call(h.totals, '/api/history?from=-100&to=-5').body as { from: number; to: number };
    expect(body.from).toBe(0);
    expect(body.to).toBe(0);
  });

  it('defaults the range to the last 7 days and refuses cross-site reads', async () => {
    const opened = await open();
    if ('disabled' in opened) return;
    const h = historyHandler(createHistory(opened.db));
    const body = call(h.totals, '/api/history').body as { from: number; to: number; by: string[] };
    expect(body.by).toEqual([]);
    expect(Math.round((body.to - body.from) / DAY)).toBe(7);
    expect(call(h.totals, '/api/history').status).toBe(200);
    const r = res();
    h.totals(req('/api/history', { 'sec-fetch-site': 'cross-site' }), r);
    expect(r.out.status).toBe(403);
  });
});
