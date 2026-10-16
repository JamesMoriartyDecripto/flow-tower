// Non-chat OpenRouter endpoints for the benchmark: decisions, embeddings, rerank. Each call returns the same
// fields a chat run is judged on (`answer`, `cost`, `provider`, timings, `error`), so judge.mjs needs no change.
// The calls take a `fetchImpl` through ctx, so tests run them against a stub with no key and no network.
//
//   ENDPOINT_CALLS[endpoint](ctx, model, task) → { answer, cost, provider, firstOutputMs, totalMs, error, raw? }
//   ctx = { key, fetchImpl = fetch, timeoutMs }
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { mimeOf } from './tasks.mjs';
import { MEDIA_CALLS } from './endpoints-media.mjs';

const API = 'https://openrouter.ai/api/v1';
const ALPHA = 'https://openrouter.ai/api/alpha';

// Every candidate gets the same data policy, as on chat; an endpoint that cannot honour it is a result.
const provider = { data_collection: 'deny' };

// The path of `rel` under `base`, or null when it resolves outside it (`../x`, an absolute path elsewhere).
// Model-written or task-written paths must not reach files the task does not own, so every such read goes through here.
export function inside(base, rel) {
  const root = resolve(base);
  const abs = resolve(root, String(rel ?? ''));
  const r = relative(root, abs);
  if (!r || r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r)) return null;
  return abs;
}

/**
 * The user message content for a task. Plain text unless the task carries `images:` on the chat endpoint,
 * then the prompt text first and each image as a base64 data URL, so the model sees the prompt before the pictures.
 */
export function userContent(task, prompt) {
  if (task.endpoint !== 'chat' || !task.images.length) return prompt;
  const images = task.images.map((img) => {
    const path = inside(task.dir, img);
    if (!path) throw new Error(`image outside the task folder: ${img}`);
    return { type: 'image_url', image_url: { url: `data:${mimeOf(img)};base64,${readFileSync(path).toString('base64')}` } };
  });
  return [{ type: 'text', text: prompt }, ...images];
}

// One POST with the shared headers. Errors come back as a value: a benchmark run must not stop on one call.
async function post(ctx, url, body) {
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const timeoutMs = ctx.timeoutMs ?? 180_000;
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower model-benchmark' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { error: `no answer: ${e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : e.name}`, totalMs: elapsed() };
  }
  if (!res.ok) {
    // The body is cut to 200 characters: enough to read the refusal, too little to echo a whole prompt.
    const text = (await res.text()).slice(0, 200);
    return { error: `HTTP ${res.status} ${text}`, totalMs: elapsed() };
  }
  try {
    return { data: await res.json(), totalMs: elapsed() };
  } catch (e) {
    return { error: `bad response: ${e.name}`, totalMs: elapsed() };
  }
}

// A failed call: no answer, no timing for the first output (it never came), the error kept as text.
const failed = (r) => ({ answer: null, cost: 0, provider: null, firstOutputMs: null, totalMs: r.totalMs, error: r.error });

// A non-streamed call has one moment of output, so the first output and the total are the same number.
const done = (data, totalMs) => ({ answer: null, cost: data.usage?.cost ?? 0, provider: data.provider ?? null, firstOutputMs: totalMs, totalMs, error: null });

// Decisions: each question's answer reduced to a plain value so the json check can compare it.
// `choice` → the candidate; `noul` (none-of-the-above) → true when its probability is at least 0.5;
// `score` → the index of the most probable level. The raw answers stay on the record for calibration.
function decisionValue(type, a) {
  if (type === 'choice') return a.choice ?? null;
  if (type === 'noul') return typeof a.noul === 'number' ? a.noul >= 0.5 : null;
  if (type === 'score') {
    // Only integer keys name a level; a stray key such as "a" would otherwise win on its probability alone.
    const entries = Object.entries(a.probabilities ?? {}).filter(([k, p]) => /^-?\d+$/.test(k) && Number.isFinite(p));
    if (!entries.length) return null;
    // The index is the integer key with the largest probability; ties keep the first key.
    let best = entries[0];
    for (const e of entries) if (e[1] > best[1]) best = e;
    return Number(best[0]);
  }
  return null;
}

async function decisions(ctx, model, task) {
  const { state, questions } = task.request;
  const r = await post(ctx, `${ALPHA}/decisions`, { model, state, questions, provider });
  if (r.error) return failed(r);
  const answers = r.data.answers ?? {};
  // Keys follow the Request block's order, not the response's, so the answer string is stable across runs.
  const out = {};
  for (const id of Object.keys(questions)) out[id] = decisionValue(answers[id]?.type ?? questions[id].type, answers[id] ?? {});
  return { ...done(r.data, r.totalMs), answer: JSON.stringify(out), raw: answers };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Embeddings: one request holds the corpus first, then the queries; each query maps to its nearest corpus id.
async function embeddings(ctx, model, task) {
  const { corpus, queries } = task.request;
  const corpusIds = Object.keys(corpus), queryIds = Object.keys(queries);
  const input = [...corpusIds.map((id) => corpus[id]), ...queryIds.map((id) => queries[id])];
  const r = await post(ctx, `${API}/embeddings`, { model, input, provider });
  if (r.error) return failed(r);
  // Rows come back with an index; sort on it so the vectors line up with the input even if the order differs.
  const vectors = [...(r.data.data ?? [])].sort((x, y) => x.index - y.index).map((d) => d.embedding);
  // A short or malformed reply would make cosine() read undefined; report it as a failed call, not a crash.
  const inputs = corpusIds.length + queryIds.length;
  if (vectors.length < inputs || vectors.some((v) => !Array.isArray(v))) {
    return failed({ error: `bad response: ${vectors.length} vectors for ${inputs} inputs`, totalMs: r.totalMs });
  }
  const pick = {};
  queryIds.forEach((qid, qi) => {
    const qv = vectors[corpusIds.length + qi];
    let best = null, bestSim = -Infinity;
    corpusIds.forEach((cid, ci) => {
      const sim = cosine(qv, vectors[ci]);
      if (sim > bestSim) { bestSim = sim; best = cid; }
    });
    pick[qid] = best;
  });
  return { ...done(r.data, r.totalMs), answer: JSON.stringify(pick) };
}

// Rerank: the answer is the document indices in the order the endpoint returns them (top_n of them).
async function rerank(ctx, model, task) {
  const { query, documents, top_n } = task.request;
  const body = { model, query, documents: documents.map((text) => ({ text })), provider };
  if (top_n) body.top_n = top_n;
  const r = await post(ctx, `${API}/rerank`, body);
  if (r.error) return failed(r);
  const order = (r.data.results ?? []).map((x) => x.index);
  return { ...done(r.data, r.totalMs), answer: JSON.stringify(order) };
}

// The media calls live in their own file to keep this one short; they share the same return contract.
// The media entries look MEDIA_CALLS up at call time: endpoints-media imports inside() from this file, so a
// spread here could read MEDIA_CALLS before that module has finished loading.
// The names are listed here, not read from MEDIA_CALLS, for the same reason: reading it at load time would fail.
const mediaCall = (name) => (ctx, model, task) => MEDIA_CALLS[name](ctx, model, task);
export const ENDPOINT_CALLS = {
  decisions, embeddings, rerank,
  images: mediaCall('images'), videos: mediaCall('videos'), speech: mediaCall('speech'), transcriptions: mediaCall('transcriptions'),
};
