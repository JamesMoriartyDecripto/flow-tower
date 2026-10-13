import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';
import { cadenceOf } from '../src/app/hud/hubAdminModel';
import { openHistory } from '../src/server/history/db';
import { toRow } from '../src/server/history/row';
import { createHistory } from '../src/server/history/store';

/** Temp db per test, never the repo. Skipped where node:sqlite is unavailable, like history.test.ts. */
const open = () => openHistory(join(mkdtempSync(join(tmpdir(), 'flow-tower-history-')), 'history.db'));

const ev = (x: object, ts = 1_000_000): FlowEvent => ({ ...FlowEventSchema.parse(x), id: 1, ts, targets: [] });

const rows = (db: DatabaseSync) => db.prepare('SELECT * FROM events').all() as Record<string, unknown>[];

describe('history: tool.end is not dropped as a replay (#187)', () => {
  it('gives a tool.start and its tool.end different event_keys', () => {
    const start = ev({ kind: 'tool.start', sender: 'alice', call: 'call_9', tool: 'Bash' });
    const end = ev({ kind: 'tool.end', sender: 'alice', call: 'call_9', tool: 'Bash' });
    const a = toRow(start, 0);
    const b = toRow(end, 0);
    expect(a?.event_key).toBeTruthy();
    expect(b?.event_key).toBeTruthy();
    expect(a?.event_key).not.toBe(b?.event_key);
  });

  it('stores both rows of a start/end pair and counts the errors of the rollup', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const history = createHistory(res.db);
    history.write([
      ev({ kind: 'tool.start', sender: 'alice', user: 'alice', call: 'call_1', tool: 'Bash' }),
      ev({ kind: 'tool.end', sender: 'alice', user: 'alice', call: 'call_1', tool: 'Bash', status: 'error' }),
      ev({ kind: 'error', sender: 'alice', user: 'alice', call: 'call_2' }),
    ]);
    expect(rows(res.db)).toHaveLength(3);
    const rollup = res.db.prepare('SELECT SUM(errors) AS errors FROM rollup_hourly').get() as { errors: number };
    expect(rollup.errors).toBe(2);
  });

  it('stores a kind: error event with no status as status error, keeping an explicit status', () => {
    const bare = toRow(ev({ kind: 'error', sender: 'alice' }), 0);
    const explicit = toRow(ev({ kind: 'error', sender: 'alice', status: 'ok' }), 0);
    expect(bare?.status).toBe('error');
    expect(explicit?.status).toBe('ok');
  });
});

describe('hub admin: the cadence shown is the one applied (#187)', () => {
  it('treats a sender with no cadence as on-demand, and keeps a set one', () => {
    expect(cadenceOf({})).toBe('on-demand');
    expect(cadenceOf({ cadence: 'scheduled' })).toBe('scheduled');
  });
});
