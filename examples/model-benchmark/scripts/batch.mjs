// OpenRouter Batch API for the benchmark's single-step tasks (#149): about half the price, done within 24 h,
// no streaming. One batch per model holds every task × run as a request; the results are read back per
// custom_id, written exactly like a sync run, and the batch is always deleted. Kept apart from bench.mjs so
// the create/poll/map/delete path stays testable with a stubbed fetch.

const API = 'https://openrouter.ai/api/v1';

// Printed once before any real run: inputs and results otherwise stay on OpenRouter's side for 30 days.
export const BATCH_WARNING = '--batch: OpenRouter keeps batch inputs and results up to 30 days unless deleted; this run deletes them after reading. Use it only for public task sets.';

// Terminal statuses: polling stops here and the results are read, whatever the outcome.
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired']);

/** In this version only a single step without tools maps onto one batch request per run. */
export const batchEligible = (task) => task.steps === 1 && task.tools.length === 0;

// The key is guarded, never reported: only the status codes travel in the events.
const headers = (key) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower model-benchmark' });

/**
 * One batch result into the same record shape a sync `runOne` writes: the extra fields are `batch: true`
 * and `firstOutputMs: null` (a batch has no per-request timing). `totalMs` stays null for the same reason.
 * Error text from the API can echo the prompt, so only a code travels, never a body.
 */
export function recordFromResult({ date, model, task, run, effort, result }) {
  const rec = {
    date, category: task.category, task: task.id, model, run, warm: false, batch: true, effort,
    ok: false, firstOutputMs: null, totalMs: null, steps: 0, retries: 0,
    promptTokens: 0, completionTokens: 0, cachedTokens: 0, cachedFirstStep: null, cost: 0,
    providers: [], answer: null, error: null,
  };
  const status = result?.response?.status_code;
  const body = result?.response?.body;
  if (result?.error || (status != null && status >= 400) || !body) {
    rec.error = result?.error
      ? `batch error${result.error.code ? ` ${result.error.code}` : ''}`
      : status != null && status >= 400 ? `HTTP ${status}` : 'no response body';
    return rec;
  }
  const u = body.usage ?? {};
  rec.promptTokens = u.prompt_tokens ?? 0;
  rec.completionTokens = u.completion_tokens ?? 0;
  rec.cachedTokens = u.prompt_tokens_details?.cached_tokens ?? 0;
  rec.cachedFirstStep = rec.cachedTokens; // step 1 is the only step a batch has
  rec.cost = Number((u.cost ?? 0).toFixed(6));
  rec.answer = body.choices?.[0]?.message?.content ?? null;
  rec.ok = rec.answer !== null;
  rec.steps = 1;
  if (rec.answer === null) rec.error = 'empty answer';
  if (body.provider) rec.providers.push(body.provider);
  return rec;
}

/**
 * Create one batch per model, poll it to a terminal status, map every request back to a run record and delete
 * the batch on every path. `fetchImpl`, `sleep` and `body` are seams: the test injects a stub, a no-op sleep
 * and its own request body, so the whole path runs without a key, a network or a 30 s wait.
 */
export async function runBatch(opts) {
  const {
    key, models, tasks, runs, effort, date,
    body, // (model, task, session) => the exact step-1 body a sync run would send
    write = () => {}, emit = () => {}, log = console.log,
    waitMinutes = 720, pollMs = 30_000, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts;
  const eligible = tasks.filter(batchEligible);
  const deadline = Date.now() + waitMinutes * 60_000;
  let written = 0;
  for (const model of models) {
    const plan = [];
    for (const task of eligible) {
      for (let run = 1; run <= runs; run++) {
        // A session per request, like a sync run: it is part of the body, not part of the answer.
        const session = `batch-${model.replace(/\W+/g, '-')}-${task.id}-${run}-${Date.now()}`;
        plan.push({ custom_id: `${task.id}#${run}`, body: body(model, task, session), task, run });
      }
    }
    if (!plan.length) continue;
    emit({ kind: 'agent.start', node: 'runner.api', model, message: `batch create: ${plan.length} request(s)` });
    let res;
    try {
      res = await fetchImpl(`${API}/batches`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({ endpoint: '/v1/chat/completions', model, requests: plan.map((r) => ({ custom_id: r.custom_id, body: r.body })) }),
      });
    } catch (e) {
      emit({ kind: 'error', node: 'runner.api', model, message: `batch create failed: ${e.name}` });
      log(`--batch ${model}: create failed (${e.name})`);
      continue;
    }
    if (!res.ok) {
      const status = res.status;
      emit({ kind: 'error', node: 'runner.api', model, message: `batch create HTTP ${status}` });
      log(`--batch ${model}: create refused (HTTP ${status})`);
      continue;
    }
    const created = await res.json();
    const id = created.id;
    let current = created;
    try {
      // Poll until terminal or out of time; the message carries counts and status only, never a body.
      while (!TERMINAL.has(current.status) && Date.now() < deadline) {
        const done = current.request_counts?.completed ?? 0;
        log(`--batch ${model}: ${id} ${current.status} (${done}/${plan.length}) — checking again in ${pollMs / 1000}s`);
        emit({ kind: 'log', node: 'runner.api', model, message: `batch ${id} ${current.status} ${done}/${plan.length}` });
        await sleep(pollMs);
        const r = await fetchImpl(`${API}/batches/${id}`, { headers: headers(key) });
        current = await r.json();
      }
      if (!TERMINAL.has(current.status)) {
        emit({ kind: 'error', node: 'runner.api', model, message: `batch ${id} still ${current.status} after ${waitMinutes} min` });
        log(`--batch ${model}: ${id} still ${current.status} after ${waitMinutes} min; giving up`);
      }
      const byId = new Map((current.results ?? []).map((x) => [x.custom_id, x]));
      for (const item of plan) {
        const result = byId.get(item.custom_id);
        const rec = recordFromResult({ date, model, task: item.task, run: item.run, effort, result });
        // A request the terminal batch did not answer is a failed run, not a missing line.
        if (!result) rec.error = `batch ${current.status}`;
        write(rec, item.task, item.run);
        written++;
      }
    } finally {
      // Inputs and results are otherwise kept 30 days: delete them once read, on every path, even when a row failed.
      await fetchImpl(`${API}/batches/${id}`, { method: 'DELETE', headers: headers(key) }).catch(() => undefined);
      emit({ kind: 'log', node: 'runner.api', model, message: `batch ${id} deleted` });
    }
  }
  return written;
}
