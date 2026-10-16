import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as endpoints from '../examples/model-benchmark/scripts/endpoints.mjs';

// The scripts are plain .mjs with no types: the calls are cast to the shapes these tests read.
type Call = (ctx: Record<string, unknown>, model: string, task: Record<string, unknown>) => Promise<{ answer: string | null; error: string | null; artifact?: string | null }>;
const { inside } = endpoints as unknown as { inside: (base: string, rel: string) => string | null };
const ENDPOINT_CALLS = endpoints.ENDPOINT_CALLS as unknown as Record<'embeddings' | 'decisions' | 'videos', Call>;

type Seen = { url: string; headers: Record<string, string> };

/** A stub fetch answering one JSON body, recording each request's URL and headers. */
function jsonStub(json: unknown) {
  const seen: Seen[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, headers: init.headers });
    return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) };
  };
  return { seen, fetchImpl };
}

describe('inside', () => {
  it('accepts a path under the base and rejects one that leaves it', () => {
    expect(inside('/tmp/task', 'fixtures/a.png')).toBe('/tmp/task/fixtures/a.png');
    expect(inside('/tmp/task', '../x')).toBeNull();
    expect(inside('/tmp/task', '/etc/passwd')).toBeNull();
  });
});

describe('embeddings containment of the reply', () => {
  it('reports a short reply as an error value instead of throwing', async () => {
    const { fetchImpl } = jsonStub({ data: [
      { index: 0, embedding: [1, 0] },
      { index: 1, embedding: [0, 1] },
    ] });
    const task = { endpoint: 'embeddings', images: [], dir: '.', request: { corpus: { c1: 'x', c2: 'y' }, queries: { q1: 'z' } } };
    const r = await ENDPOINT_CALLS.embeddings({ key: 'k', fetchImpl, timeoutMs: 5000 }, 'a/x', task);
    expect(r.answer).toBeNull();
    expect(r.error).toBe('bad response: 2 vectors for 3 inputs');
  });
});

describe('decisions score', () => {
  it('ignores a probability key that is not an integer', async () => {
    const { fetchImpl } = jsonStub({ answers: { q1: { type: 'score', probabilities: { a: 0.9, 1: 0.6 } } } });
    const task = { endpoint: 'decisions', images: [], dir: '.', request: { state: {}, questions: { q1: { type: 'score' } } } };
    const r = await ENDPOINT_CALLS.decisions({ key: 'k', fetchImpl, timeoutMs: 5000 }, 'a/x', task);
    expect(JSON.parse(r.answer as string)).toEqual({ q1: 1 });
  });
});

describe('media artifact name and download key', () => {
  let outDir: string;
  beforeEach(() => { outDir = mkdtempSync(join(tmpdir(), 'review-media-')); });
  afterEach(() => { rmSync(outDir, { recursive: true, force: true }); });

  // A video job that completes at once: submit, then one download from `url`.
  async function videoJob(url: string) {
    const seen: Seen[] = [];
    const fetchImpl = async (u: string, init: { method: string; headers: Record<string, string> }) => {
      seen.push({ url: u, headers: init.headers });
      if (init.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'v1', status: 'completed', unsigned_urls: [url] }), text: async () => '' };
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), headers: new Map(), text: async () => '' };
    };
    const r = await ENDPOINT_CALLS.videos(
      { key: 'secret', fetchImpl, timeoutMs: 5000, outDir, run: 1, pollMs: 0, videoWaitMs: 1000, videoModels: {} },
      'a/b c',
      { id: 't:1', prompt: 'p' },
    );
    return { r, seen };
  }

  it('names the artifact with no path separator, space or colon', async () => {
    const { r } = await videoJob('https://storage.example.com/v.mp4');
    const name = String(r.artifact).replace(/^artifacts\//, '');
    expect(name).toBe('t_1-a__b_c-run1.mp4');
    expect(name).not.toMatch(/[\/ :]/);
  });

  it('fetches an http openrouter.ai download without the key', async () => {
    const { seen } = await videoJob('http://openrouter.ai/files/v.mp4');
    const download = seen.find((s) => s.url.startsWith('http://openrouter.ai/'));
    expect(download).toBeDefined();
    expect(download?.headers.Authorization).toBeUndefined();
  });
});
