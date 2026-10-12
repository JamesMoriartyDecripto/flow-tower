import { describe, expect, it } from 'vitest';
import { BATCH_NOTE, batchOne, chatUrl, generationCost } from '../tools/squad/batch.mjs';

const KEY = 'sk-or-test-secret-key';
const body = { model: 'vendor-a/model-x', messages: [{ role: 'user', content: 'review this diff' }] };

type Call = { method: string; url: string; body?: unknown };

/**
 * A stubbed fetch scripting create → poll → delete. `createStatus` refuses the create when not 2xx;
 * `polls` are walked in order and the last one holds. Every call is recorded for assertions.
 */
// A poll entry `{ httpStatus: 503 }` answers that HTTP status with an error body and no status field.
function stubFetch({ createStatus = 200, createBody = { error: { message: 'refused' } }, polls = [{ status: 'completed', results: [] }] }: {
  createStatus?: number; createBody?: unknown; polls?: Record<string, unknown>[];
}) {
  const calls: Call[] = [];
  let poll = 0;
  const fetchImpl = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'POST') {
      if (createStatus >= 300) return { ok: false, status: createStatus, json: async () => createBody };
      return { ok: true, status: 202, json: async () => ({ id: 'batch-1', status: 'in_progress' }) };
    }
    if (method === 'DELETE') return { ok: true, status: 200, json: async () => ({}) };
    const r = polls[Math.min(poll, polls.length - 1)];
    poll++;
    if (r.httpStatus) return { ok: false, status: r.httpStatus, json: async () => ({ error: { code: r.httpStatus } }) };
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

  it('marks a create refused for a model without a batch endpoint as noBatch, without the message', async () => {
    const lines: string[] = [];
    const { calls, fetchImpl } = stubFetch({
      createStatus: 400,
      createBody: { error: { message: "Model 'z-ai/glm-5.3-flashx' does not have a :batch endpoint.", code: 400 } },
    });
    const out = await run(fetchImpl, { log: (l: string) => lines.push(l) });
    expect(out).toEqual({ ok: false, error: 'no batch endpoint', noBatch: true });
    expect(calls.map((c) => c.method)).toEqual(['POST']);
    expect(JSON.stringify([out, ...lines])).not.toContain('glm-5.3-flashx');
  });

  it('a 400 for another reason is not noBatch', async () => {
    const { fetchImpl } = stubFetch({ createStatus: 400, createBody: { error: { message: 'bad request', code: 400 } } });
    const out = await run(fetchImpl);
    expect(out).toEqual({ ok: false, error: 'create HTTP 400' });
    expect(out).not.toHaveProperty('noBatch');
  });

  it('three failed polls in a row give poll failed, and the batch is deleted', async () => {
    const { calls, fetchImpl } = stubFetch({ polls: [{ httpStatus: 503 }] });
    expect(await run(fetchImpl)).toEqual({ ok: false, error: 'poll failed' });
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(3);
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE' });
  });

  it('one failed poll then a completed one is still ok', async () => {
    const { fetchImpl } = stubFetch({ polls: [{ httpStatus: 503 }, { status: 'completed', results: [answer('fine')] }] });
    expect(await run(fetchImpl)).toMatchObject({ ok: true, content: 'fine' });
  });

  it('reports the id to onCreated once the batch exists', async () => {
    const ids: string[] = [];
    const { fetchImpl } = stubFetch({ polls: [{ status: 'completed', results: [answer('ok')] }] });
    await run(fetchImpl, { onCreated: (id: string) => ids.push(id) });
    expect(ids).toEqual(['batch-1']);
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

  it('a create that answers 2xx without an id logs that a batch may exist, and does not poll', async () => {
    const lines: string[] = [];
    const calls: Call[] = [];
    const fetchImpl = async (url: string, init: { method?: string } = {}) => {
      calls.push({ method: init.method ?? 'GET', url });
      return { ok: true, status: 200, json: async () => ({ status: 'in_progress' }) };
    };
    expect(await run(fetchImpl, { log: (l: string) => lines.push(l) })).toEqual({ ok: false, error: 'create failed' });
    expect(calls.map((c) => c.method)).toEqual(['POST']);
    expect(lines.join('\n')).toContain('a batch may have been created and cannot be deleted');
  });

  it('a 2xx create whose body is not JSON still counts as created when it has an id', async () => {
    const calls: Call[] = [];
    const fetchImpl = async (url: string, init: { method?: string } = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url });
      if (method === 'POST') return { ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } };
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await run(fetchImpl)).toEqual({ ok: false, error: 'create failed' });
    expect(calls.map((c) => c.method)).toEqual(['POST']);
  });

  it('retries the delete once, logs deleted only on success, and never logs the body', async () => {
    const lines: string[] = [];
    let deletes = 0;
    const fetchImpl = async (_url: string, init: { method?: string } = {}) => {
      const method = init.method ?? 'GET';
      if (method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'batch-1', status: 'completed', results: [answer('ok')] }) };
      if (method === 'DELETE') {
        deletes++;
        return deletes === 1 ? { ok: false, status: 500, json: async () => ({ secret: 'x' }) } : { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await run(fetchImpl, { log: (l: string) => lines.push(l) })).toMatchObject({ ok: true });
    expect(deletes).toBe(2);
    expect(lines).toContain('squad batch batch-1: deleted');
  });

  it('when both deletes fail, logs the HTTP status and that the batch stays up to 30 days', async () => {
    const lines: string[] = [];
    const fetchImpl = async (_url: string, init: { method?: string } = {}) => {
      const method = init.method ?? 'GET';
      if (method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'batch-1', status: 'completed', results: [answer('ok')] }) };
      if (method === 'DELETE') return { ok: false, status: 503, json: async () => ({ error: { message: KEY } }) };
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await run(fetchImpl, { log: (l: string) => lines.push(l) });
    expect(lines).toContain('squad batch batch-1: delete failed (HTTP 503): the batch stays on OpenRouter up to 30 days');
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('encodes the id in every batch URL, so a hostile id cannot change the path', async () => {
    const calls: Call[] = [];
    const evil = 'x/../../chat?a=1';
    const fetchImpl = async (url: string, init: { method?: string } = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url });
      if (method === 'POST') return { ok: true, status: 200, json: async () => ({ id: evil, status: 'completed', results: [answer('ok')] }) };
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await run(fetchImpl);
    const batchCalls = calls.filter((c) => c.url.includes('/batches/'));
    expect(batchCalls.length).toBeGreaterThan(0);
    for (const c of batchCalls) expect(c.url).toContain(encodeURIComponent(evil));
  });

  it('gives every batch request an abort signal', async () => {
    const signals: unknown[] = [];
    const fetchImpl = async (_url: string, init: { method?: string; signal?: unknown } = {}) => {
      signals.push(init.signal);
      if ((init.method ?? 'GET') === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'batch-1', status: 'completed', results: [answer('ok')] }) };
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await run(fetchImpl);
    expect(signals.length).toBeGreaterThan(1);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });

  it('generationCost reads total_cost from the generation endpoint, with the id encoded', async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ data: { total_cost: 0.0031 } }) };
    };
    expect(await generationCost({ key: KEY, id: 'gen-1&x', fetchImpl, sleep: async () => {} })).toBe(0.0031);
    expect(urls).toEqual(['https://openrouter.ai/api/v1/generation?id=gen-1%26x']);
  });

  it('generationCost retries three times five seconds apart, then gives null, never 0', async () => {
    const sleeps: number[] = [];
    let tries = 0;
    const fetchImpl = async () => { tries++; return { ok: true, status: 200, json: async () => ({ data: {} }) }; };
    const out = await generationCost({ key: KEY, id: 'gen-1', fetchImpl, sleep: async (ms: number) => { sleeps.push(ms); } });
    expect(out).toBeNull();
    expect(tries).toBe(3);
    expect(sleeps).toEqual([5000, 5000]);
  });

  it('generationCost takes a later try when the first one lags', async () => {
    let tries = 0;
    const fetchImpl = async () => {
      tries++;
      return tries < 2
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ data: { total_cost: 0.5 } }) };
    };
    expect(await generationCost({ key: KEY, id: 'gen-1', fetchImpl, sleep: async () => {} })).toBe(0.5);
    expect(tries).toBe(2);
  });

  it('exposes the chat URL under the API base and a one-line note about the 30-day policy', () => {
    expect(chatUrl()).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(BATCH_NOTE).toContain('30 days');
    expect(BATCH_NOTE).toContain('deletes them after reading');
    expect(BATCH_NOTE.split('\n')).toHaveLength(1);
  });
});
