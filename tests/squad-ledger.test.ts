import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM helper under tools/, no type declarations
import { appendRun, issueOf, ledgerPath, readRuns, summarize } from '../tools/squad/ledger.mjs';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'squad-ledger-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('squad ledger (#156)', () => {
  it('resolves the issue from --issue, then the branch name', () => {
    expect(issueOf('156', undefined)).toBe('156');
    expect(issueOf(undefined, 'fix/126-bin-split')).toBe('126');
    expect(issueOf(undefined, 'main')).toBeNull();
    expect(issueOf('abc', 'feat/9-x')).toBe('9');
  });

  it('round-trips appended runs and skips a malformed line', () => {
    const path = join(dir, 'nested', 'costs.jsonl');
    expect(appendRun(path, { issue: '1', role: 'coder', model: 'm', steps: 2, cost: 0.5 })).toBe(true);
    writeFileSync(path, readFileSync(path, 'utf8') + '{not json\n\n', 'utf8');
    appendRun(path, { issue: '1', role: 'reviewer', model: 'm', steps: 1, cost: 0.1 });
    const runs = readRuns(path);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ role: 'coder', steps: 2 });
    expect(readRuns(join(dir, 'missing.jsonl'))).toEqual([]);
  });

  it('returns false instead of throwing on an unwritable path', () => {
    const blocker = join(dir, 'file');
    writeFileSync(blocker, 'x');
    expect(appendRun(join(blocker, 'costs.jsonl'), { issue: '1' })).toBe(false);
  });

  it('honours SQUAD_LEDGER and FLOW_TOWER_HOME', () => {
    expect(ledgerPath({ SQUAD_LEDGER: '/x/y.jsonl' })).toBe('/x/y.jsonl');
    expect(ledgerPath({ FLOW_TOWER_HOME: '/home/ft' })).toBe(join('/home/ft', 'squad-costs.jsonl'));
  });

  it('summarizes one issue by role and model, sorted by cost', () => {
    const runs = [
      { issue: '156', role: 'coder', model: 'a', steps: 10, cost: 0.2, promptTokens: 100, cachedTokens: 50 },
      { issue: '156', role: 'coder', model: 'a', steps: 5, cost: 0.1, promptTokens: 40, cachedTokens: 0 },
      { issue: '156', role: 'reviewer', model: 'b', steps: 3, cost: 0.4, promptTokens: 10, cachedTokens: 0 },
      { issue: '99', role: 'coder', model: 'a', steps: 99, cost: 9, promptTokens: 1, cachedTokens: 0 },
    ];
    const s = summarize(runs, '156');
    expect(s.rows.map((r: { role: string }) => r.role)).toEqual(['reviewer', 'coder']);
    expect(s.rows[1]).toMatchObject({ runs: 2, steps: 15, promptTokens: 140, cachedTokens: 50 });
    expect(s.rows[1].cost).toBeCloseTo(0.3);
    expect(s.total.runs).toBe(3);
    expect(s.total.steps).toBe(18);
    expect(s.total.cost).toBeCloseTo(0.7);
  });
});
