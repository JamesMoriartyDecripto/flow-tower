import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
// @ts-expect-error plain .mjs without declarations
import { planJobs, reportOf } from '../examples/model-benchmark/scripts/squad-loop.mjs';

const script = resolve('examples/model-benchmark/scripts/squad-loop.mjs');
const judge = resolve('examples/model-benchmark/tasks/judge');

describe('squad-loop planJobs', () => {
  it('runs run-major with models interleaved', () => {
    const jobs = planJobs({ tasks: ['t1', 't2'], models: ['a', 'b'], runs: 2 });
    expect(jobs).toHaveLength(8);
    expect(jobs.slice(0, 4).map((j: { run: number; model: string; task: string }) => [j.run, j.model, j.task])).toEqual([
      [1, 'a', 't1'], [1, 'b', 't1'], [1, 'a', 't2'], [1, 'b', 't2'],
    ]);
    expect(jobs[4].run).toBe(2);
  });
});

describe('squad-loop reportOf', () => {
  it('drops the header and the footer', () => {
    const stdout = 'mode: tool\nreviewed: no\nthe answer\n\n--- model-x · 3 steps\n';
    expect(reportOf(stdout)).toBe('the answer');
  });

  it('keeps a --- line that sits inside the answer', () => {
    const stdout = 'mode: tool\nreviewed: no\nfirst\n---\nsecond\n\n--- model-x · 2 steps\n';
    expect(reportOf(stdout)).toBe('first\n---\nsecond');
  });
});

describe('squad-loop CLI', () => {
  it('dry-run prints the plan for two models and two runs', () => {
    const out = execFileSync(process.execPath, [script, '--role', 'architect', '--category', 'judge', '--tasks', judge, '--models', 'a,b', '--out', '/tmp/loop-test.jsonl', '--runs', '2', '--dry-run'], { encoding: 'utf8', timeout: 20000 });
    expect(out).toContain('2 models × 3 tasks × 2 runs = 12 runs');
  });

  it('dry-run with --only keeps one task', () => {
    const out = execFileSync(process.execPath, [script, '--role', 'lead-judge', '--category', 'judge', '--tasks', judge, '--models', 'a', '--out', '/tmp/loop-test.jsonl', '--only', 'steps-scope', '--dry-run'], { encoding: 'utf8', timeout: 20000 });
    expect(out).toContain('1 tasks');
  });
});
