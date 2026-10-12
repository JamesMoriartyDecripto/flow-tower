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

const CUSTOM_ID = 'squad';

// The key is only ever sent in the header; it is never put in an error or a log line.
const headers = (key) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower squad' });

const minutesSince = (start) => Number(((Date.now() - start) / 60_000).toFixed(1));

/**
 * Create a one-request batch, poll it to a terminal status (or the deadline), read the answer and delete the batch.
 * `fetchImpl`, `sleep` and `log` are seams: the tests inject a stub, a no-op sleep and a log sink.
 * Returns `{ ok: true, content, usage }` or `{ ok: false, error }` with a short code only.
 */
export async function batchOne({
  key, body, pollMs = 30_000, waitMinutes = 720, fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {},
}) {
  const start = Date.now();
  const deadline = start + waitMinutes * 60_000;

  // A refused create means nothing was created: no poll and no delete.
  let created;
  try {
    const res = await fetchImpl(`${API_BASE}/batches`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        endpoint: '/v1/chat/completions',
        model: body.model,
        requests: [{ custom_id: CUSTOM_ID, body }],
      }),
    });
    if (!res.ok) {
      log(`squad batch: create refused (HTTP ${res.status})`);
      return { ok: false, error: `create HTTP ${res.status}` };
    }
    created = await res.json();
  } catch (e) {
    log(`squad batch: create failed (${e.name})`);
    return { ok: false, error: 'create failed' };
  }

  // From here a batch exists, so every path below ends in the finally that deletes it.
  const id = created.id;
  try {
    let current = created;
    while (!TERMINAL.has(current.status) && Date.now() < deadline) {
      log(`squad batch ${id}: ${current.status} after ${minutesSince(start)} min`);
      await sleep(pollMs);
      const r = await fetchImpl(`${API_BASE}/batches/${id}`, { headers: headers(key) });
      current = await r.json();
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
    return { ok: true, content, usage: answer.usage ?? {} };
  } catch (e) {
    log(`squad batch ${id}: poll failed (${e.name})`);
    return { ok: false, error: 'poll failed' };
  } finally {
    // Inputs and results are kept 30 days otherwise: delete them once read, even when the answer failed.
    await fetchImpl(`${API_BASE}/batches/${id}`, { method: 'DELETE', headers: headers(key) }).catch(() => undefined);
    log(`squad batch ${id}: deleted`);
  }
}
