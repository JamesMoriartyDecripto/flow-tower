import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BATCH_WARNING, batchEligible, recordFromResult, runBatch } from '../examples/model-benchmark/scripts/batch.mjs';

const bench = 'examples/model-benchmark/scripts/bench.mjs';
const report = 'examples/model-benchmark/scripts/report.mjs';

const task = (id: string, over: Record<string, unknown> = {}) => ({
  id, category: 'doc-writer', steps: 1, tools: [], prompt: `do ${id}`, ...over,
});

/** A stubbed fetch scripting create → poll → results → delete; every call is recorded for assertions. */
function stubFetch({ polls }: { polls?: { status: string; results?: unknown[] }[] }) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const script = polls ?? [{ status: 'completed', results: [] }];
  let poll = 0;
  const fetchImpl = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'POST') return { ok: true, status: 202, json: async () => ({ id: 'batch-1', status: 'processing', request_counts: { completed: 0 } }) };
    if (method === 'DELETE') return { ok: true, status: 200, json: async () => ({}) };
    // GET: walk the scripted poll responses, holding the last once it runs out.
    const r = script[Math.min(poll, script.length - 1)];
    poll++;
    return { ok: true, status: 200, json: async () => ({ id: 'batch-1', ...r }) };
  };
  return { calls, fetchImpl };
}

/** A result row shaped like OpenRouter's per-custom_id entry: a chat completion body carries the usage. */
const result = (custom_id: string, over: Record<string, unknown> = {}) => ({
  custom_id,
  response: {
    status_code: 200,
    body: {
      provider: 'vendor-p',
      choices: [{ message: { role: 'assistant', content: `answer ${custom_id}` } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001, prompt_tokens_details: { cached_tokens: 5 } },
    },
  },
  ...over,
});

describe('batch.mjs --batch (#149)', () => {
  it('only takes single-step, tool-less tasks', () => {
    expect(batchEligible(task('a'))).toBe(true);
    expect(batchEligible(task('b', { steps: 4 }))).toBe(false);
    expect(batchEligible(task('c', { tools: ['read_file'] }))).toBe(false);
    expect(batchEligible(task('d', { steps: 1, tools: ['read_file'] }))).toBe(false);
  });

  it('creates one batch per model and maps every row back to a run record', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ status: 'in_progress' }, { status: 'completed', results: [result('a#1'), result('a#2')] }] });
    const written: unknown[] = [];
    const n = await runBatch({
      key: 'k', models: ['vendor-a/model-x'], tasks: [task('a')], runs: 2, effort: 'low', date: '2026-01-01',
      body: (model: string, t: { prompt: string }, session: string) => ({ model, session_id: session, messages: [{ role: 'user', content: t.prompt }] }),
      write: (rec: unknown) => written.push(rec), sleep: async () => {}, pollMs: 1, fetchImpl,
    });
    expect(n).toBe(2);
    // The create carries the endpoint and one request per task × run, custom_id `<task>#<run>`.
    const create = calls.find((c) => c.method === 'POST');
    expect(create?.url).toContain('/v1/batches');
    expect(create?.body).toMatchObject({ endpoint: '/v1/chat/completions', model: 'vendor-a/model-x' });
    expect((create?.body as { requests: { custom_id: string }[] }).requests.map((r) => r.custom_id)).toEqual(['a#1', 'a#2']);
    // Every record reads like a sync run, plus batch: true and no first-output timing.
    expect(written).toEqual([
      expect.objectContaining({ model: 'vendor-a/model-x', task: 'a', run: 1, batch: true, ok: true, firstOutputMs: null, totalMs: null, steps: 1, promptTokens: 100, completionTokens: 20, cachedTokens: 5, cost: 0.001, answer: 'answer a#1', error: null }),
      expect.objectContaining({ run: 2, batch: true, answer: 'answer a#2' }),
    ]);
    // The batch is deleted once the rows are read.
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE' });
    expect(calls.at(-1)?.url).toContain('/v1/batches/batch-1');
  });

  it('records a failed row and still deletes the batch', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ status: 'completed', results: [result('a#1'), { custom_id: 'a#2', error: { code: 'server_error' } }] }] });
    const written: { error: string | null; ok: boolean }[] = [];
    await runBatch({
      key: 'k', models: ['vendor-a/model-x'], tasks: [task('a')], runs: 2, effort: 'low', date: '2026-01-01',
      body: () => ({}), write: (rec: { error: string | null; ok: boolean }) => written.push(rec), sleep: async () => {}, pollMs: 1, fetchImpl,
    });
    expect(written[0].ok).toBe(true);
    expect(written[1]).toMatchObject({ ok: false, error: 'batch error server_error' });
    // Even with a failed row, the inputs and results are cleaned up.
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('maps a usage-less or non-2xx row to an error line, never a zero-cost answer', () => {
    const base = { date: 'd', model: 'm', task: task('a'), run: 1, effort: 'low' };
    expect(recordFromResult({ ...base, result: { custom_id: 'a#1', response: { status_code: 429, body: { error: {} } } } })).toMatchObject({ ok: false, error: 'HTTP 429' });
    expect(recordFromResult({ ...base, result: { custom_id: 'a#1' } })).toMatchObject({ ok: false, error: 'no response body' });
  });

  it('stops polling at the deadline and still deletes a batch that never finished', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ status: 'in_progress' }] });
    await runBatch({
      key: 'k', models: ['vendor-a/model-x'], tasks: [task('a')], runs: 1, effort: 'low', date: '2026-01-01',
      body: () => ({}), write: () => {}, log: () => {}, sleep: async () => {}, pollMs: 1, waitMinutes: 0, fetchImpl,
    });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('names the 30-day policy once before a real run', () => {
    expect(BATCH_WARNING).toContain('30 days');
    expect(BATCH_WARNING).toContain('deletes them after reading');
  });

  it('shows the batch plan and the skipped tasks in --dry-run without a key', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'bench-batch-')), 'out');
    try {
      // No OPENROUTER_API_KEY in the env: the dry run must get as far as the plan without one.
      const text = execFileSync(process.execPath, [bench, '--category', 'reviewer', '--models', 'a/x', '--tasks', 'examples/model-benchmark/tasks/reviewer/', '--runs', '2', '--dry-run', '--batch', '--out', out], { encoding: 'utf8', env: {} });
      expect(text).toContain('skips reviewer/events-204');
      expect(text).toContain('batch: one batch per model');
      // A category whose tasks all qualify shows them in the plan and no skip line.
      const doc = execFileSync(process.execPath, [bench, '--category', 'doc-writer', '--models', 'a/x', '--tasks', 'examples/model-benchmark/tasks/doc-writer/', '--runs', '2', '--dry-run', '--batch', '--out', out], { encoding: 'utf8', env: {} });
      expect(doc).toContain('1 models × 2 tasks × 2 runs');
      expect(doc).not.toContain('skips doc-writer');
    } finally {
      rmSync(join(out, '..'), { recursive: true, force: true });
    }
  });
});

describe('report.mjs batch rows (#149)', () => {
  // A batch line against a sync line: the batch one must be labelled, its first output dashed, its total gone.
  const line = (extra: Record<string, unknown>) => JSON.stringify({
    date: '2026-01-01', category: 'doc-writer', task: 'navigation', model: 'a/x', run: 1, effort: 'low',
    ok: true, pass: true, rubric: false, totalMs: 1000, firstOutputMs: 500, steps: 1,
    promptTokens: 100, completionTokens: 10, cachedTokens: 10, cachedFirstStep: 0, cost: 0.002,
    retries: 0, providers: ['p'], error: null, answer: 'x', ...extra,
  });

  it('labels a batch model and shows an en dash for its first output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-report-batch-'));
    try {
      const file = join(dir, 'batch.jsonl');
      writeFileSync(file, `${line({ model: 'a/x', batch: true, firstOutputMs: null, totalMs: null })}\n`);
      const md = execFileSync(process.execPath, [report, '--in', file], { encoding: 'utf8' });
      expect(md).toContain('`a/x` (batch)');
      // The First output column for a batch-only model is an en dash, not a number.
      expect(md).toMatch(/\| - \[-\] \| – \|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
