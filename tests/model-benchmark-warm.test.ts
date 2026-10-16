import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bench = 'examples/model-benchmark/scripts/bench.mjs';
const report = 'examples/model-benchmark/scripts/report.mjs';

function run(args: string[]): string {
  const out = join(mkdtempSync(join(tmpdir(), 'bench-warm-')), 'out');
  try {
    return execFileSync(process.execPath, [bench, ...args, '--out', out], { encoding: 'utf8', env: {} });
  } finally {
    rmSync(join(out, '..'), { recursive: true, force: true });
  }
}

describe('bench.mjs --warm (#149)', () => {
  // The plan is the only part of a --warm run that needs no key and no network, so it is what a test can pin.
  it('counts cold and warm runs in the plan', () => {
    // doc-writer: a two-task folder the role benchmark (#231) did not grow.
    const base = ['--category', 'doc-writer', '--models', 'a/x', '--tasks', 'examples/model-benchmark/tasks/doc-writer/', '--runs', '2', '--dry-run'];
    expect(run(base)).toContain('× 2 runs = 4 runs');
    expect(run([...base, '--warm'])).toContain('× 2 runs × 2 (cold + warm) = 8 runs');
  });
});

describe('report.mjs warm columns (#149)', () => {
  const line = (extra: Record<string, unknown>) => JSON.stringify({
    date: '2026-01-01', category: 'coder', task: 'format-price', model: 'a/x', run: 1, effort: 'low',
    ok: true, pass: true, rubric: false, totalMs: 1000, firstOutputMs: 500, steps: 1,
    promptTokens: 100, completionTokens: 10, cachedTokens: 10, cachedFirstStep: 0, cost: 0.002,
    retries: 0, providers: ['p'], error: null, answer: 'x', ...extra,
  });
  it('adds the two warm columns only when warm lines are present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-report-'));
    try {
      const cold = join(dir, 'cold.jsonl');
      writeFileSync(cold, `${line({})}\n`);
      const coldMd = execFileSync(process.execPath, [report, '--in', cold], { encoding: 'utf8' });
      expect(coldMd).not.toContain('$ / run warm');

      const mixed = join(dir, 'mixed.jsonl');
      // A line without the field counts as cold; the warm one gets its own columns.
      writeFileSync(mixed, `${line({})}\n${line({ warm: true, cost: 0.0005, cachedTokens: 90 })}\n`);
      const mixedMd = execFileSync(process.execPath, [report, '--in', mixed], { encoding: 'utf8' });
      expect(mixedMd).toContain('| $ / run warm |');
      expect(mixedMd).toContain('| cached % warm |');
      expect(mixedMd).toContain('| $0.0005 |');
      expect(mixedMd).toContain('| 90% |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
