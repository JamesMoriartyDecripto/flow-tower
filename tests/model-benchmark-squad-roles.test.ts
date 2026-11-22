import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { planJobs, rescoreLine } from '../examples/model-benchmark/scripts/squad-roles.mjs';
// @ts-expect-error plain .mjs without declarations
import { parseVerdict, checkFinding } from '../tools/squad/gate.mjs';

const script = resolve('examples/model-benchmark/scripts/squad-roles.mjs');

describe('squad-roles planJobs', () => {
  it('runs run-major with models interleaved, for every case and role', () => {
    const cases = [{ id: 'a' }, { id: 'b' }];
    const jobs = planJobs({ cases, roles: ['reviewer'], models: ['m1', 'm2'], runs: 2 });
    expect(jobs).toHaveLength(2 * 2 * 1 * 2);
    expect(jobs.slice(0, 4).map((j) => `${j.run}${j.case.id}${j.model}`)).toEqual(['1am1', '1am2', '1bm1', '1bm2']);
    expect(jobs[4].run).toBe(2);
  });
});

describe('squad-roles rescoreLine', () => {
  const answer = '{"verdict":"changes","findings":[{"severity":"high","file":"a.sh:1","quote":"mapfile -t x","what":"mapfile is missing in bash 3.2","why":"w","fix":"f"}]}';
  // The stored line passed, so a rescore that copied the old score instead of recomputing it would fail the first test.
  const line = { ts: 't', role: 'reviewer', model: 'm1', case: 'old', kind: 'clean', run: 1, seconds: 4.2, outcome: 'finish', cost: 0.01, promptTokens: 9, cachedTokens: 0, pass: true, keys: [], answer };
  const deps = { parseVerdict, checkFinding, readFile: () => 'mapfile -t x\n' };

  it('fails a clean case that the run flagged', () => {
    const out = rescoreLine(line, { id: 'C2', kind: 'clean', head: 'abc', keys: [] }, deps);
    expect(out.pass).toBe(false);
    expect(out.case).toBe('C2');
  });

  it('passes a defect case whose key matches, keeping cost, seconds and answer', () => {
    const out = rescoreLine(line, { id: 'D2', kind: 'defect', head: 'abc', keys: [{ id: 'M2', file: 'a.sh', pattern: 'mapfile' }] }, deps);
    expect(out).toMatchObject({ pass: true, keys: ['M2'], kind: 'defect', case: 'D2', cost: 0.01, seconds: 4.2, answer, role: 'reviewer' });
  });
});

describe('squad-roles --dry-run', () => {
  let dir: string;
  let args: string[];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'squad-roles-test-'));
    const cases = { cases: [{ id: 'c1', issue: 1, kind: 'defect', head: 'abc', keys: [] }, { id: 'c2', issue: 2, kind: 'clean', head: 'abc', keys: [] }] };
    const casesPath = join(dir, 'cases.json');
    const packs = join(dir, 'packs');
    writeFileSync(casesPath, JSON.stringify(cases));
    mkdirSync(packs);
    for (const p of ['c1.reviewer.md', 'c1.security.md', 'c2.reviewer.md', 'c2.security.md']) writeFileSync(join(packs, p), 'task');
    args = ['--cases', casesPath, '--packs', packs, '--models', 'm1,m2', '--out', join(dir, 'out.jsonl'), '--dry-run'];
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints the run count and exits 0', () => {
    const out = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000 });
    expect(out).toContain('2 models × 2 cases × 2 roles × 3 runs = 24 runs');
  });

  it('exits 1 and names the missing pack', () => {
    rmSync(join(dir, 'packs', 'c2.security.md'));
    let err: { status: number; stderr: string } | undefined;
    try {
      execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      err = e as { status: number; stderr: string };
    }
    expect(err?.status).toBe(1);
    expect(err?.stderr).toContain('c2.security.md');
  });
});
