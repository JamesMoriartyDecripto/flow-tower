import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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

  it('skips null costs in the totals and counts them as unknownCost', () => {
    const runs = [
      { issue: '5', role: 'reviewer', model: 'a', steps: 1, cost: 0.2, promptTokens: 1, cachedTokens: 0 },
      { issue: '5', role: 'reviewer', model: 'a', steps: 1, cost: null, costUnknown: true, promptTokens: 1, cachedTokens: 0 },
    ];
    const s = summarize(runs, '5');
    expect(s.total).toMatchObject({ runs: 2, steps: 2, unknownCost: 1 });
    expect(s.total.cost).toBeCloseTo(0.2);
    expect(s.rows[0]).toMatchObject({ runs: 2, unknownCost: 1 });
  });

  it('cost.mjs says how many runs have an unknown cost', () => {
    const ledger = join(dir, 'costs.jsonl');
    appendRun(ledger, { issue: '9', role: 'reviewer', model: 'a', steps: 1, cost: 0.25, promptTokens: 4, cachedTokens: 0 });
    appendRun(ledger, { issue: '9', role: 'reviewer', model: 'a', steps: 1, cost: null, costUnknown: true, promptTokens: 4, cachedTokens: 0 });
    const script = fileURLToPath(new URL('../tools/squad/cost.mjs', import.meta.url));
    const out = execFileSync(process.execPath, [script, '9'], { env: { ...process.env, SQUAD_LEDGER: ledger }, encoding: 'utf8', timeout: 20_000 });
    expect(out).toContain('**Squad cost for #9:** $0.2500 (1 with unknown cost, not counted) over 2 runs, 2 steps.');
  });

  it('sums the same issue number of two projects apart, and --all sums both', () => {
    const ledger = join(dir, 'costs.jsonl');
    appendRun(ledger, { project: 'alpha', issue: '1', role: 'coder', model: 'a', steps: 1, cost: 0.5, promptTokens: 1, cachedTokens: 0 });
    appendRun(ledger, { project: 'beta', issue: '1', role: 'coder', model: 'a', steps: 1, cost: 0.25, promptTokens: 1, cachedTokens: 0 });
    const script = fileURLToPath(new URL('../tools/squad/cost.mjs', import.meta.url));
    const env = { ...process.env, SQUAD_LEDGER: ledger };
    const alpha = execFileSync(process.execPath, [script, '1', '--repo', join(dir, 'alpha')], { env, encoding: 'utf8', timeout: 20_000 });
    expect(alpha).toContain('**Squad cost for #1:** $0.5000 over 1 run, 1 step.');
    const all = execFileSync(process.execPath, [script, '1', '--repo', join(dir, 'alpha'), '--all'], { env, encoding: 'utf8', timeout: 20_000 });
    expect(all).toContain('**Squad cost for #1:** $0.7500 over 2 runs, 2 steps.');
  });

  it('counts an entry without a project for flow-tower only', () => {
    const ledger = join(dir, 'costs.jsonl');
    // Entries written before #265 carry no project: they were all runs of this repo.
    appendRun(ledger, { issue: '2', role: 'coder', model: 'a', steps: 1, cost: 0.3, promptTokens: 1, cachedTokens: 0 });
    const script = fileURLToPath(new URL('../tools/squad/cost.mjs', import.meta.url));
    const env = { ...process.env, SQUAD_LEDGER: ledger };
    const flow = execFileSync(process.execPath, [script, '2', '--repo', join(dir, 'flow-tower')], { env, encoding: 'utf8', timeout: 20_000 });
    expect(flow).toContain('**Squad cost for #2:** $0.3000 over 1 run, 1 step.');
    const other = execFileSync(process.execPath, [script, '2', '--repo', join(dir, 'other')], { env, encoding: 'utf8', timeout: 20_000 });
    expect(other).toContain('No squad runs recorded for #2.');
  });

  it('cost.mjs prints the issue block, or a no-runs line', () => {
    const ledger = join(dir, 'costs.jsonl');
    appendRun(ledger, { issue: '7', role: 'coder', model: 'a', steps: 4, cost: 0.1, promptTokens: 10, cachedTokens: 5 });
    appendRun(ledger, { issue: '7', role: 'coder', model: 'a', steps: 2, cost: 0.02, promptTokens: 0, cachedTokens: 0 });
    appendRun(ledger, { issue: '7', role: 'reviewer', model: 'b', steps: 1, cost: 0.03, promptTokens: 4, cachedTokens: 0 });
    const env = { ...process.env, SQUAD_LEDGER: ledger };
    const script = fileURLToPath(new URL('../tools/squad/cost.mjs', import.meta.url));
    const out = execFileSync(process.execPath, [script, '7'], { env, encoding: 'utf8', timeout: 20_000 });
    expect(out).toContain('**Squad cost for #7:** $0.1500 over 3 runs, 7 steps.');
    expect(out).toContain('| Role | Model | Runs | Steps | Cost | Cache |');
    expect(out).toContain('| coder | a | 2 | 6 | $0.1200 | 50% |');
    expect(out).toContain('| reviewer | b | 1 | 1 | $0.0300 | 0% |');
    const none = execFileSync(process.execPath, [script, '8'], { env, encoding: 'utf8', timeout: 20_000 });
    expect(none).toContain('No squad runs recorded for #8.');
  });
});
