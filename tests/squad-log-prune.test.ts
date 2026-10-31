import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// The runner's helper is plain .mjs with no types; the test imports it directly.
// @ts-expect-error no declaration file for the runner's helper
import { pickStale, pruneLogs } from '../tools/squad/log-prune.mjs';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 31);
// Timestamps are 13-digit ms values; `daysAgo` makes each log's age explicit.
const logsAged = (n: number, daysAgo: number) =>
  Array.from({ length: n }, (_, i) => `coder-${NOW - daysAgo * DAY - i}.log`);

let dirs: string[] = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

describe('pickStale', () => {
  it('keeps the newest 200 regardless of age', () => {
    const names = logsAged(205, 20);
    const stale = pickStale(names, NOW);
    expect(stale).toHaveLength(5);
    // The five oldest are the stale ones; the 200 newest of the same age stay.
    expect(stale).toEqual(names.slice(200));
  });

  it('marks nothing stale when all 205 logs are 1 day old', () => {
    expect(pickStale(logsAged(205, 1), NOW)).toEqual([]);
  });

  it('never returns names that are not role logs', () => {
    const names = ['squad.json', 'notes.log', 'coder-123.log', ...logsAged(1, 30)];
    expect(pickStale(names, NOW, { keep: 0, maxAgeDays: 0 })).toEqual(logsAged(1, 30));
  });
});

describe('pruneLogs', () => {
  it('removes the stale logs beyond keep and leaves other files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'squad-prune-'));
    dirs.push(dir);
    const names = logsAged(3, 30);
    for (const n of [...names, 'squad.json']) writeFileSync(join(dir, n), '');
    expect(pruneLogs(dir, NOW, { keep: 1, maxAgeDays: 0 })).toBe(2);
    expect(readdirSync(dir).sort()).toEqual(['squad.json', names[0]].sort());
  });
});
