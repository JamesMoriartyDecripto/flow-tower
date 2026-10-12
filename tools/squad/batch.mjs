// One squad review through the OpenRouter Batch API: about half the price, done within 24 h (median minutes).
// A batch takes requests without tools, answered in one turn, so a review or security pass can wait for it
// when the maintainer is not in a hurry. The batch is always deleted once read, on every path.

// Never set SQUAD_API_BASE in normal use: it exists so the tests can point the client at a stub.
export const API_BASE = process.env.SQUAD_API_BASE || 'https://openrouter.ai/api/v1';

export const chatUrl = () => `${API_BASE}/chat/completions`;

// Printed before a real run: inputs and results otherwise stay on OpenRouter's side for 30 days.
export const BATCH_NOTE = 'OpenRouter keeps batch inputs and results up to 30 days unless deleted; this deletes them after reading, so only public material (this repo\'s diffs) should go through it.';

// Terminal statuses: polling stops here and the outcome is decided, whatever it is.
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired']);

// A poll that fails once is often a blip (a 5xx); three in a row mean the batch cannot be followed any more.
const MAX_BAD_POLLS = 3;

// The generation stats can lag a few seconds behind the answer: three tries, five seconds apart.
const COST_TRIES = 3;
const COST_GAP_MS = 5_000;

const CUSTOM_ID = 'squad';

// Every batch request is bounded: a stalled socket must not hold a paid run (or the interrupt handler) forever.
const timeout = () => AbortSignal.timeout(30_000);

// The id comes from the provider's body: it is encoded so it can never change the path or the query.
const batchUrl = (id) => `${API_BASE}/batches/${encodeURIComponent(id)}`;

// The key is only ever sent in the header; it is never put in an error or a log line.
const headers = (key) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower squad' });

const minutesSince = (start) => Number(((Date.now() - start) / 60_000).toFixed(1));

// Used by run.mjs on Ctrl-C, where batchOne's finally never runs. Resolves to whether the delete was accepted.
export const deleteBatch = (key, id, signal) =>
  fetch(batchUrl(id), { method: 'DELETE', headers: headers(key), signal }).then((r) => r.ok).catch(() => false);

// Deletes once, then once more: a batch kept 30 days is the cost of a silent failure, so one retry is cheap.
// Logs `deleted` only when OpenRouter accepted the DELETE; a failure logs its HTTP status, never the body.
async function removeBatch(fetchImpl, key, id, log) {
  let status = 'none';
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetchImpl(batchUrl(id), { method: 'DELETE', headers: headers(key), signal: timeout() }).catch(() => null);
    if (r?.ok) { log(`squad batch ${id}: deleted`); return; }
    status = r?.status ?? 'none';
  }
  log(`squad batch ${id}: delete failed (HTTP ${status}): the batch stays on OpenRouter up to 30 days`);
}

/**
 * Create a one-request batch, poll it to a terminal status (or the deadline), read the answer and delete the batch.
 * `fetchImpl`, `sleep` and `log` are seams: the tests inject a stub, a no-op sleep and a log sink.
 * `onCreated(id)` lets the caller remember the batch while it is pending, so an interrupt can still delete it.
 * Returns `{ ok: true, content, usage, generationId }` or `{ ok: false, error }` with a short code only.
 * A model with no batch endpoint returns `{ ok: false, error, noBatch: true }`, so the caller can fall back.
 */
export async function batchOne({
  key, body, pollMs = 30_000, waitMinutes = 720, fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, onCreated = () => {},
}) {
  const start = Date.now();
  const deadline = start + waitMinutes * 60_000;

  // A refused create means nothing was created: no poll and no delete.
  let res;
  try {
    res = await fetchImpl(`${API_BASE}/batches`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        endpoint: '/v1/chat/completions',
        model: body.model,
        requests: [{ custom_id: CUSTOM_ID, body }],
      }),
      signal: timeout(),
    });
  } catch (e) {
    log(`squad batch: create failed (${e.name})`);
    return { ok: false, error: 'create failed' };
  }
  if (!res.ok) {
    // OpenRouter names the case in the error message. The message is only matched, never logged or returned.
    const err = await res.json().catch(() => null);
    if (String(err?.error?.message ?? '').includes('does not have a :batch endpoint')) {
      log('squad batch: this model has no batch endpoint');
      return { ok: false, error: 'no batch endpoint', noBatch: true };
    }
    log(`squad batch: create refused (HTTP ${res.status})`);
    return { ok: false, error: `create HTTP ${res.status}` };
  }
  // Parsed outside any try that reports a failed create: a 2xx with an unreadable body may still have made a batch.
  const created = await res.json().catch(() => null);
  const id = created?.id;
  if (typeof id !== 'string' || id === '') {
    log('squad batch: create answered without an id: a batch may have been created and cannot be deleted');
    return { ok: false, error: 'create failed' };
  }
  onCreated(id);

  // From here a batch exists, so every path below ends in the finally that deletes it.
  try {
    let current = created;
    let bad = 0;
    while (!TERMINAL.has(current.status) && Date.now() < deadline) {
      log(`squad batch ${id}: ${current.status} after ${minutesSince(start)} min`);
      await sleep(pollMs);
      const r = await fetchImpl(batchUrl(id), { headers: headers(key), signal: timeout() });
      // A poll only counts when it is a 2xx with a string status; anything else is logged by code alone.
      const next = r.ok ? await r.json().catch(() => null) : null;
      if (typeof next?.status !== 'string') {
        bad++;
        log(`squad batch ${id}: poll HTTP ${r.status}`);
        if (bad === MAX_BAD_POLLS) return { ok: false, error: 'poll failed' };
        continue;
      }
      bad = 0;
      current = next;
    }
    log(`squad batch ${id}: ${current.status} after ${minutesSince(start)} min`);

    if (!TERMINAL.has(current.status)) return { ok: false, error: 'timed out' };
    if (current.status === 'expired') return { ok: false, error: 'batch expired' };
    if (current.status !== 'completed') return { ok: false, error: `batch ${current.status}` };

    const item = (current.results ?? []).find((x) => x.custom_id === CUSTOM_ID);
    if (item?.error) return { ok: false, error: 'batch error' };
    const status = item?.response?.status_code;
    if (status != null && status >= 400) return { ok: false, error: `HTTP ${status}` };
    const answer = item?.response?.body;
    const content = answer?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content === '') return { ok: false, error: 'empty answer' };
    return { ok: true, content, usage: answer.usage ?? {}, generationId: answer.id };
  } catch (e) {
    log(`squad batch ${id}: poll failed (${e.name})`);
    return { ok: false, error: 'poll failed' };
  } finally {
    // Inputs and results are kept 30 days otherwise: delete them once read, even when the answer failed.
    await removeBatch(fetchImpl, key, id, log);
  }
}

/**
 * The cost of one completion from OpenRouter's generation endpoint, for an answer whose usage has no cost
 * (batch results carry none). Resolves to the number, or null when it is still unknown after the tries:
 * the caller records null, never a false 0.
 */
export async function generationCost({ key, id, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  for (let attempt = 1; attempt <= COST_TRIES; attempt++) {
    const r = await fetchImpl(`${API_BASE}/generation?id=${encodeURIComponent(id)}`, { headers: headers(key), signal: timeout() }).catch(() => null);
    const info = r?.ok ? await r.json().catch(() => null) : null;
    const cost = info?.data?.total_cost;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) return cost;
    if (attempt < COST_TRIES) await sleep(COST_GAP_MS);
  }
  log('squad batch: cost not known from the generation endpoint');
  return null;
}
