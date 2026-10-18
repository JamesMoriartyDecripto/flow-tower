import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_CALLS } from '../examples/model-benchmark/scripts/endpoints.mjs';
import { loadTask, taskProblems } from '../examples/model-benchmark/scripts/tasks.mjs';

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

/** A stubbed fetch that answers one canned JSON body (or a status) and records the request. */
function stub(reply: { status?: number; json?: unknown; text?: string }) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const status = reply.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => reply.json,
      text: async () => reply.text ?? JSON.stringify(reply.json ?? {}),
    };
  };
  return { calls, ctx: { key: 'k', fetchImpl, timeoutMs: 5000 } };
}

/** A minimal task object as loadTask would build it, for the endpoint calls. */
const task = (endpoint: string, request: Record<string, unknown>) => ({ endpoint, request, images: [], dir: '.' });

describe('endpoints: decisions', () => {
  it('reduces choice, noul and score answers to plain values and keeps the raw answers', async () => {
    const { calls, ctx } = stub({
      json: {
        model: 'vendor-a/x',
        provider: 'vendor-p',
        answers: {
          team: { type: 'choice', choice: 'payments' },
          is_bug: { type: 'noul', noul: 0.3 },
          urgency: { type: 'score', score: 1, probabilities: { '0': 0.1, '1': 0.7, '2': 0.2 } },
        },
        usage: { input_tokens: 10, output_tokens: 5, cost: 0.002 },
      },
    });
    const r = await ENDPOINT_CALLS.decisions(ctx, 'vendor-a/x', task('decisions', {
      state: { text: 'payment fails' },
      questions: {
        team: { type: 'choice', instructions: 'pick', criteria: { payments: 'billing', ops: 'infra' } },
        is_bug: { type: 'noul', instructions: 'bug?', criteria: { bug: 'defect' } },
        urgency: { type: 'score', instructions: 'how urgent', criteria: ['low', 'mid', 'high'] },
      },
    }));
    expect(r.answer).toBe('{"team":"payments","is_bug":false,"urgency":1}');
    expect(r.error).toBeNull();
    expect(r.raw).toMatchObject({ urgency: { probabilities: { '1': 0.7 } } });
    expect(r.cost).toBe(0.002);
    expect(calls[0].url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(calls[0].body).toMatchObject({
      model: 'vendor-a/x',
      state: { text: 'payment fails' },
      provider: { data_collection: 'deny' },
    });
    expect(Object.keys(calls[0].body.questions as object)).toEqual(['team', 'is_bug', 'urgency']);
    expect(calls[0].headers.Authorization).toBe('Bearer k');
  });
});

describe('endpoints: embeddings', () => {
  it('picks the nearest corpus id for each query', async () => {
    const { calls, ctx } = stub({
      json: {
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [0, 1] },
          { index: 2, embedding: [1, 1] },
          { index: 3, embedding: [0.9, 0.1] },
          { index: 4, embedding: [0.1, 0.9] },
        ],
        usage: { prompt_tokens: 8 },
      },
    });
    const r = await ENDPOINT_CALLS.embeddings(ctx, 'vendor-a/e', task('embeddings', {
      corpus: { doc_a: 'alpha', doc_b: 'beta', doc_c: 'gamma' },
      queries: { q1: 'first', q2: 'second' },
    }));
    expect(JSON.parse(r.answer as string)).toEqual({ q1: 'doc_a', q2: 'doc_b' });
    // The corpus goes first in the single request.
    expect(calls[0].body.input).toEqual(['alpha', 'beta', 'gamma', 'first', 'second']);
    expect(calls[0].body.provider).toEqual({ data_collection: 'deny' });
  });
});

describe('endpoints: rerank', () => {
  it('returns the document indices in the order the endpoint gives them', async () => {
    const { calls, ctx } = stub({ json: { results: [{ index: 2, relevance_score: 0.9 }, { index: 0, relevance_score: 0.4 }], usage: { cost: 0.001 } } });
    const r = await ENDPOINT_CALLS.rerank(ctx, 'vendor-a/r', task('rerank', { query: 'q', documents: ['a', 'b', 'c'], top_n: 2 }));
    expect(r.answer).toBe('[2,0]');
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/rerank');
    expect(calls[0].body).toMatchObject({ query: 'q', documents: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], top_n: 2 });
  });
});

describe('endpoints: errors', () => {
  it('turns an HTTP 404 into an error string and never throws', async () => {
    const { ctx } = stub({ status: 404, text: 'no endpoints found' });
    const r = await ENDPOINT_CALLS.rerank(ctx, 'vendor-a/r', task('rerank', { query: 'q', documents: ['a'] }));
    expect(r.error).toMatch(/^HTTP 404/);
    expect(r.answer).toBeNull();
  });
});

describe('tasks: endpoint front matter', () => {
  it('reports a decisions task that has no Request block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-endpoint-'));
    try {
      const file = join(dir, 'triage.md');
      writeFileSync(file, [
        '---', 'id: triage', 'category: intent', 'check: json', 'endpoint: decisions', '---',
        '# Triage', '', '## Prompt', 'Classify the ticket.', '', '## Expected', '```json', '{"team":"ops"}', '```', '',
      ].join('\n'));
      const problems = taskProblems(loadTask(file));
      expect(problems.some((p) => p.includes('decisions needs a valid'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
