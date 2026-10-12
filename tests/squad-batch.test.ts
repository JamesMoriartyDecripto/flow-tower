import { describe, expect, it } from 'vitest';
import { BATCH_NOTE, batchOne, chatUrl } from '../tools/squad/batch.mjs';

const KEY = 'sk-or-test-secret-key';
const body = { model: 'vendor-a/model-x', messages: [{ role: 'user', content: 'review this diff' }] };

type Call = { method: string; url: string; body?: unknown };

/**
 * A stubbed fetch scripting create → poll → delete. `createStatus` refuses the create when not 2xx;
 * `polls` are walked in order and the last one holds. Every call is recorded for assertions.
 */
function stubFetch({ createStatus = 200, polls = [{ status: 'completed', results: [] }] }: {
  createStatus?: number; polls?: Record<string, unknown>[];
}) {
  const calls: Call[] = [];
  let poll = 0;
  const fetchImpl = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'POST') {
      if (createStatus >= 300) return { ok: false, status: createStatus, json: async () => ({ error: 'refused' }) };
      return { ok: true, status: 202, json: async () => ({ id: 'batch-1', status: 'in_progress' }) };
    }
    if (method === 'DELETE') return { ok: true, status: 200, json: async () => ({}) };
    const r = polls[Math.min(poll, polls.length - 1)];
    poll++;
    return { ok: true, status: 200, json: async () => ({ id: 'batch-1', ...r }) };
  };
  return { calls, fetchImpl };
}

/** A result row shaped like OpenRouter's entry for custom_id `squad`: a chat completion body with usage. */
const answer = (content: string) => ({
  custom_id: 'squad',
  response: {
    status_code: 200,
    body: {
      choices: [{ message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.002 },
    },
  },
});

const run = (fetchImpl: unknown, over: Record<string, unknown> = {}) =>
  batchOne({ key: KEY, body, pollMs: 1, sleep: async () => {}, fetchImpl, ...over } as Parameters<typeof batchOne>[0]);

describe('squad batch (one review through the Batch API)', () => {
  it('returns the answer and usage of a completed batch, and deletes the batch', async () => {
    const { calls, fetchImpl } = stubFetch({
      polls: [{ status: 'in_progress' }, { status: 'completed', results: [answer('LGTM, one nit')] }],
    });
    const out = await run(fetchImpl);
    expect(out).toEqual({ ok: true, content: 'LGTM, one nit', usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.002 } });
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE' });
    expect(calls.at(-1)?.url).toContain('/batches/batch-1');
  });

  it('sends the create with the endpoint, the model and exactly the given request body', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ status: 'completed', results: [answer('ok')] }] });
    await run(fetchImpl);
    const create = calls.find((c) => c.method === 'POST');
    expect(create?.url).toBe('https://openrouter.ai/api/v1/batches');
    expect(create?.body).toEqual({
      endpoint: '/v1/chat/completions',
      model: 'vendor-a/model-x',
      requests: [{ custom_id: 'squad', body }],
    });
  });

  it('reports a failed batch with its code and still deletes it', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ status: 'failed' }] });
    expect(await run(fetchImpl)).toEqual({ ok: false, error: 'batch failed' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('reports an expired batch as batch expired and still deletes it', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ status: 'expired' }] });
    expect(await run(fetchImpl)).toEqual({ ok: false, error: 'batch expired' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('refuses a create with HTTP 401 without polling or deleting, since nothing was created', async () => {
    const { calls, fetchImpl } = stubFetch({ createStatus: 401 });
    expect(await run(fetchImpl)).toEqual({ ok: false, error: 'create HTTP 401' });
    expect(calls.map((c) => c.method)).toEqual(['POST']);
  });

  it('times out at the deadline with a batch that never finished, and deletes it', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ status: 'in_progress' }] });
    expect(await run(fetchImpl, { waitMinutes: 0 })).toEqual({ ok: false, error: 'timed out' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('reports an empty answer as empty answer and still deletes the batch', async () => {
    const { calls, fetchImpl } = stubFetch({
      polls: [{ status: 'completed', results: [{ custom_id: 'squad', response: { status_code: 200, body: { choices: [{ message: { content: '' } }] } } }] }],
    });
    expect(await run(fetchImpl)).toEqual({ ok: false, error: 'empty answer' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('never puts the key or the request body in a log line or an error', async () => {
    const lines: string[] = [];
    const { fetchImpl } = stubFetch({ polls: [{ status: 'in_progress' }, { status: 'failed' }] });
    const out = await run(fetchImpl, { log: (line: string) => lines.push(line) });
    const all = [JSON.stringify(out), ...lines].join('\n');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('review this diff');
    expect(lines.some((l) => l.includes('batch-1'))).toBe(true);
  });

  it('exposes the chat URL under the API base and a one-line note about the 30-day policy', () => {
    expect(chatUrl()).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(BATCH_NOTE).toContain('30 days');
    expect(BATCH_NOTE).toContain('deletes them after reading');
    expect(BATCH_NOTE.split('\n')).toHaveLength(1);
  });
});
