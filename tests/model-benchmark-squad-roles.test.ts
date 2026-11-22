import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error plain .mjs without declarations
import { answerOf, planJobs } from '../examples/model-benchmark/scripts/squad-roles.mjs';

const script = resolve('examples/model-benchmark/scripts/squad-roles.mjs');

describe('squad-roles planJobs', () => {
  it('runs run-major with models interleaved, for every case and role', () => {
    const cases = [{ id: 'a' }, { id: 'b' }];
    const jobs = planJobs({ cases, roles: ['reviewer'], models: ['m1', 'm2'], runs: 2 }) as { model: string; case: { id: string }; run: number }[];
    expect(jobs).toHaveLength(2 * 2 * 1 * 2);
    expect(jobs.slice(0, 4).map((j) => `${j.run}${j.case.id}${j.model}`)).toEqual(['1am1', '1am2', '1bm1', '1bm2']);
    expect(jobs[4].run).toBe(2);
  });
});

describe('squad-roles answerOf', () => {
  it('drops the mode and reviewed lines', () => {
    expect(answerOf('mode: oneshot\nreviewed: x\n{"verdict":"approve"}\nend')).toBe('{"verdict":"approve"}\nend');
  });
});

describe('squad-roles --dry-run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'squad-roles-test-'));
  const cases = { cases: [{ id: 'c1', issue: 1, kind: 'defect', head: 'abc', keys: [] }, { id: 'c2', issue: 2, kind: 'clean', head: 'abc', keys: [] }] };
  const casesPath = join(dir, 'cases.json');
  const packs = join(dir, 'packs');
  writeFileSync(casesPath, JSON.stringify(cases));
  mkdirSync(packs);
  const packNames = ['c1.reviewer.md', 'c1.security.md', 'c2.reviewer.md', 'c2.security.md'];
  for (const p of packNames) writeFileSync(join(packs, p), 'task');
  const args = ['--cases', casesPath, '--packs', packs, '--models', 'm1,m2', '--out', join(dir, 'out.jsonl'), '--dry-run'];

  it('prints the run count and exits 0', () => {
    const out = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000 });
    expect(out).toContain('2 models × 2 cases × 2 roles × 3 runs = 24 runs');
  });

  it('exits 1 and names the missing pack', () => {
    rmSync(join(packs, 'c2.security.md'));
    let err: { status: number; stderr: string } | undefined;
    try {
      execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      err = e as { status: number; stderr: string };
    }
    expect(err?.status).toBe(1);
    expect(err?.stderr).toContain('c2.security.md');
    rmSync(dir, { recursive: true, force: true });
  });
});
