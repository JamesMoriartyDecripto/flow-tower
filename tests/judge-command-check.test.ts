import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs judge.mjs on one coder/format-price answer and returns the judged row.
// Spawned like judge-emit-check.test.ts: no tower URL, so nothing leaves the test.
function judgeAnswer(answer: string): { pass: boolean; detail: string } {
  const dir = mkdtempSync(join(tmpdir(), 'judge-command-'));
  try {
    const file = join(dir, 'runs.jsonl');
    writeFileSync(file, JSON.stringify({ date: '2026-01-01', category: 'coder', task: 'format-price', model: 'a/x', run: 1, effort: 'low', answer, error: null, promptTokens: 10, completionTokens: 5, cachedTokens: 0, cachedFirstStep: 0, cost: 0.001, totalMs: 10, firstOutputMs: 5, steps: 1, retries: 0, providers: ['p'], ok: true }) + '\n');
    const res = spawnSync(process.execPath, ['examples/model-benchmark/scripts/judge.mjs', '--in', file, '--tasks', 'examples/model-benchmark/tasks/coder/'], { encoding: 'utf8', timeout: 30_000 });
    expect(res.status, res.stderr).toBe(0);
    const row = JSON.parse(readFileSync(join(dir, 'runs.judged.jsonl'), 'utf8').trim()) as { pass: boolean; detail: string };
    return { pass: row.pass, detail: row.detail };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('judge command check', () => {
  // Regression: Node 24 rejects --experimental-permission, so every command check failed before running.
  it('passes a correct formatPrice module and never reports a bad option', { timeout: 30_000 }, () => {
    const answer = [
      '```js',
      'export function formatPrice(p) {',
      "  if (p === null || p === undefined || p === '') return '-';",
      '  const n = Number(p);',
      "  if (n < 0) return 'var';",
      // Scale to cents with a rounded integer first: 0.0000025 * 1e8 is 250.00000000000003, not an exact 250.
      "  return '$' + (Math.round(n * 1e8) / 100).toFixed(2);",
      '}',
      '```',
    ].join('\n');
    const row = judgeAnswer(answer);
    expect(row.pass).toBe(true);
    expect(row.detail).not.toMatch(/bad option/i);
  });

  it('fails a wrong formatPrice module with a real check detail', { timeout: 30_000 }, () => {
    const answer = '```js\nexport function formatPrice() {\n  return \'$0.00\';\n}\n```';
    const row = judgeAnswer(answer);
    expect(row.pass).toBe(false);
    expect(row.detail).not.toMatch(/bad option/i);
  });
});
