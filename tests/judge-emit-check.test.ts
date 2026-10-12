import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('judge emit check', () => {
  it('emits check start/end and blind/scores logs', { timeout: 30_000 }, async () => {
    const got: Record<string, unknown>[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { try { got.push(JSON.parse(body) as Record<string, unknown>); } catch { /* ignore */ } res.writeHead(204).end(); });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    const dir = mkdtempSync(join(tmpdir(), 'judge-check-'));
    const file = join(dir, 'runs.jsonl');
    writeFileSync(file, JSON.stringify({ date: '2026-01-01', category: 'reviewer', task: 'events-204', model: 'a/x', run: 1, effort: 'low', answer: 'The endpoint answers 200 instead of 204.', error: null, promptTokens: 10, completionTokens: 5, cachedTokens: 0, cachedFirstStep: 0, cost: 0.001, totalMs: 10, firstOutputMs: 5, steps: 1, retries: 0, providers: ['p'], ok: true }) + '\n');
    const args = ['examples/model-benchmark/scripts/judge.mjs', '--in', file, '--tasks', 'examples/model-benchmark/tasks/reviewer/', '--url', `http://127.0.0.1:${port}`];
    const child = spawn(process.execPath, args);
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const code = await new Promise<number | null>((r) => child.on('close', r));
    server.close();
    await new Promise((r) => setTimeout(r, 200));
    rmSync(dir, { recursive: true, force: true });
    console.log('exit', code, 'out', out.slice(0, 200), 'err', err.slice(0, 400));
    console.log(JSON.stringify(got, null, 2));
    expect(code).toBe(0);
    expect(got.some((e) => e.kind === 'tool.start' && e.node === 'judges.check')).toBe(true);
    expect(got.some((e) => e.kind === 'log' && e.node === 'judges.scores')).toBe(true);
  });
});
