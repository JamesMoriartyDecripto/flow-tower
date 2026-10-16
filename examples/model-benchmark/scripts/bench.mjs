#!/usr/bin/env node
// Model benchmark runner: the same tasks, the same tool loop and the same prompt for every candidate,
// through OpenRouter. One JSON line per run, appended as it finishes, so a crash keeps what was paid for.
//
//   node scripts/bench.mjs --category coder --models a/x,b/y --tasks tasks/coder/ --runs 3 --out results/2026-10-11.jsonl
//   node scripts/bench.mjs ... --warm          each run is repeated at once with the same session_id, to price a warm cache
//   node scripts/bench.mjs ... --batch         single-step, tool-less tasks go through the Batch API: about half price, within 24 h
//   node scripts/bench.mjs ... --dry-run      prints the plan and checks the task files; needs no key
//
// --url http://127.0.0.1:5317 (or FLOW_TOWER_URL) posts events to the tower's own model-benchmark.tower.yaml,
// so the maintainer watches the run live. Only metadata travels: never a prompt, an answer, a file or the key.
// The key comes only from OPENROUTER_API_KEY in the shell. It is never read from a file, printed or logged.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { live } from './live.mjs';
import { BATCH_WARNING, batchEligible, runBatch } from './batch.mjs';
import { loadTasks, taskProblems } from './tasks.mjs';
import { ENDPOINT_CALLS, userContent } from './endpoints.mjs';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const dry = argv.includes('--dry-run');
const warm = argv.includes('--warm');
const batch = argv.includes('--batch');
const today = new Date().toISOString().slice(0, 10);
const category = arg('category');
const models = (arg('models') || '').split(',').map((m) => m.trim()).filter(Boolean);
const tasksPath = arg('tasks', category ? `tasks/${category}/` : undefined);
const runs = Number(arg('runs', 3));
const out = arg('out', `results/${today}.jsonl`);
const timeoutMs = Number(arg('timeout', 180)) * 1000;
const effort = arg('effort', 'low');
// The tower's own URL: --url wins, FLOW_TOWER_URL is the fallback, and '' means the run is not watched.
const url = arg('url', env.FLOW_TOWER_URL || '');
const emit = live(url);

if (!tasksPath || !models.length || !(runs >= 1)) {
  console.error('usage: bench.mjs --category <c> --models a,b --tasks tasks/<c>/ --runs N --out results/<date>.jsonl [--timeout 180] [--effort low] [--warm] [--batch] [--batch-wait 720] [--url http://127.0.0.1:5317] [--dry-run]');
  exit(2);
}

// 1. Tasks: refuse to spend money on a task that cannot be judged.
let tasks;
try { tasks = loadTasks(tasksPath); } catch (e) { console.error(`cannot read tasks: ${e.message}`); exit(2); }
tasks = tasks.filter((t) => !category || t.category === category);
let broken = 0;
for (const t of tasks) {
  const p = taskProblems(t);
  broken += p.length;
  console.log(`${p.length ? 'FAIL' : 'ok  '} ${t.category}/${t.id}  check=${t.check}${t.rubric ? '+rubric' : ''}  tools=${t.tools.join(',') || 'none'}  steps<=${t.steps}`);
  for (const x of p) console.log(`       - ${x}`);
}
if (!tasks.length) { console.error(`no tasks in ${tasksPath}`); exit(2); }

// With --batch only single-step, tool-less chat tasks can go: the others are skipped with a clear line each.
// Non-chat endpoints are one request each and never go through the Batch API in this version.
const batchable = (t) => batchEligible(t) && t.endpoint === 'chat';
const batchTasks = batch ? tasks.filter(batchable) : tasks;
if (batch) for (const t of tasks) if (!batchable(t)) console.log(`--batch skips ${t.category}/${t.id} (${t.endpoint !== 'chat' ? `endpoint ${t.endpoint}` : `${t.steps} steps, tools: ${t.tools.join(',') || 'none'}`}): only chat with steps: 1 and no tools can be batched`);

const calls = models.length * batchTasks.length * runs * (warm ? 2 : 1);
// A non-chat task is one request, so its step count does not count toward the cap.
const maxCalls = models.length * runs * (warm ? 2 : 1) * batchTasks.reduce((s, t) => s + (t.endpoint === 'chat' ? t.steps : 1), 0);
console.log(`\nplan: ${models.length} models × ${batchTasks.length} tasks × ${runs} runs${warm ? ' × 2 (cold + warm)' : ''} = ${calls} runs (at most ${maxCalls} model calls, ${maxCalls * 2} with retries)`);
console.log(`models: ${models.join(', ')}`);
if (batch) console.log(`batch: one batch per model, ${calls / models.length} request(s) each, at about half price`);
console.log(`order: run-major, models interleaved, so a slow hour or a provider incident hits every model alike`);
console.log(`output: ${out}  timeout: ${timeoutMs / 1000}s + 1 retry  effort: ${effort}`);
if (runs < 3) console.log('note: fewer than 3 runs per cell: label every result ILLUSTRATIVE');
if (broken) { console.error(`\n${broken} task problem(s): fix them before a real run`); exit(1); }
if (dry) {
  // The dry run is part of the story too: `runner.dryrun` pulses while the task files are checked.
  // Awaited only here: exit() would otherwise kill the fire-and-forget POST before it leaves.
  const events = [
    emit({ kind: 'agent.start', node: 'runner.dryrun', agent: 'bench --dry-run', message: `${models.length} models × ${batchTasks.length} tasks × ${runs} runs${warm ? ' (cold + warm)' : ''}` }),
    emit({ kind: 'agent.end', node: 'runner.dryrun', agent: 'bench --dry-run', status: 'ok', message: 'plan printed, task files checked' }),
  ];
  if (url) await Promise.all(events); // no url: nothing to wait for, the no-op resolves at once
  exit(0);
}

const KEY = env.OPENROUTER_API_KEY;
if (!KEY) { console.error('OPENROUTER_API_KEY is not set in this shell (it is never read from a file)'); exit(2); }
// The key is guarded, never reported: the event says it was found, not what it is.
emit({ kind: 'log', node: 'runner.key', message: 'OPENROUTER_API_KEY found in the shell' });

// 2. Tools. Only what a task declares; read_file sees the task's own fixtures and nothing else.
const S = { type: 'string' };
const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const TOOL_DEFS = {
  read_file: fn('read_file', 'Read one of the files this task provides, with line numbers.', { path: S }, ['path']),
};
const FINISH = fn('finish', 'End the task with your final answer, in the format the task asks for.', { answer: S }, ['answer']);

function readFixture(task, path) {
  const rel = relative(task.dir, resolve(task.dir, String(path ?? '')));
  if (!task.files.includes(rel)) throw new Error(`not available: ${path}. Files: ${task.files.join(', ')}`);
  return readFileSync(join(task.dir, rel), 'utf8').split('\n').map((l, i) => `${i + 1}\t${l}`).join('\n');
}

const SYSTEM = 'You are being evaluated on a software task from a real repository. Work only with the tools you are given. '
  + 'When you have tools, call finish with your final answer; without tools, reply with the final answer only. Be concise.';

// 3. One streamed call. Streaming is the only way to see the first useful token; reasoning deltas do not count.
// Prompt caching is opt-in per request and only Claude models honour it here: cache reads cost 0.1x, writes 1.25x.
const cacheControl = (model) => (model.startsWith('anthropic/') ? { cache_control: { type: 'ephemeral' } } : {});

class CallError extends Error { constructor(msg, retry) { super(msg); this.retry = retry; } }

// The step-1 body both the sync loop and --batch send, so a batch request is exactly what runOne would post.
// `stream` is added by call() alone: the Batch API takes no streaming.
function stepBody(model, task, session, messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: userContent(task, task.prompt) }]) {
  const tools = task.tools.length ? [...task.tools.map((t) => TOOL_DEFS[t]), FINISH] : undefined;
  return {
    model,
    messages,
    max_tokens: 4000, usage: { include: true }, session_id: session,
    // OpenRouter caches Claude prompts only on request; the breakpoint trails the last cacheable block (https://openrouter.ai/docs/guides/best-practices/prompt-caching).
    ...cacheControl(model),
    reasoning: { effort },
    // Every candidate gets the same data policy; an endpoint that cannot honour it is a result.
    provider: { require_parameters: true, data_collection: 'deny' },
    ...(tools && { tools }),
  };
}

async function call(body) {
  const t0 = performance.now();
  // Every call lights runner.api. The message carries the status code only, never the response body.
  const toolEnd = (status, message) => emit({ kind: 'tool.end', node: 'runner.api', tool: 'chat/completions', model: body.model, status, duration_ms: Math.round(performance.now() - t0), ...(message && { message }) });
  emit({ kind: 'tool.start', node: 'runner.api', tool: 'chat/completions', model: body.model });
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower model-benchmark' },
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    toolEnd('error', e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : e.name);
    throw new CallError(`no answer: ${e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : e.message}`, true);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    toolEnd('error', `HTTP ${res.status}`); // the body stays out: it can name the prompt or the endpoints
    // 404 "no endpoints" (zdr + require_parameters) is a finding, not a glitch: never retried.
    throw new CallError(`HTTP ${res.status} ${text}`, res.status === 429 || res.status >= 500);
  }
  let first = null, content = '', usage = null, provider = null, buf = '';
  const toolCalls = [];
  const dec = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue; // ": OPENROUTER PROCESSING" keep-alives
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const j = JSON.parse(data);
        if (j.error) throw new CallError(`stream error: ${j.error.message ?? 'unknown'}`, true);
        provider ??= j.provider ?? null;
        if (j.usage) usage = j.usage;
        const d = j.choices?.[0]?.delta ?? {};
        if (first === null && (d.content || d.tool_calls?.length)) first = performance.now() - t0;
        if (d.content) content += d.content;
        for (const tc of d.tool_calls ?? []) {
          const c = (toolCalls[tc.index ?? 0] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.function.name += tc.function.name;
          if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
        }
      }
    }
  } catch (e) {
    toolEnd('error', e instanceof CallError ? 'stream error' : 'stream broke');
    throw e instanceof CallError ? e : new CallError(`stream broke: ${e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : e.message}`, true);
  }
  toolEnd('ok');
  return { first, ms: performance.now() - t0, content, toolCalls: toolCalls.filter(Boolean), usage, provider };
}

// 4. One run: fresh session (cold cache at step 1, warm afterwards), capped steps, one retry per call.
// The warm pass reuses the cold run's session_id so the provider can serve the same prefix from its cache.
// A non-chat task: one request through its endpoint call, written with the same fields as a chat run.
// The endpoint and the raw answers ride along, so judge.mjs and calibration can read them later.
async function runEndpoint(model, task, run) {
  const rec = {
    date: today, category: task.category, task: task.id, model, run, warm: false, effort, ok: false,
    firstOutputMs: null, totalMs: 0, steps: 1, retries: 0,
    promptTokens: 0, completionTokens: 0, cachedTokens: 0, cachedFirstStep: null, cost: 0,
    providers: [], answer: null, error: null, endpoint: task.endpoint,
  };
  emit({ kind: 'agent.start', node: 'runner.loop', model, message: `${task.category}/${task.id} run ${run} (${task.endpoint})` });
  // outDir is where media endpoints keep their files (artifacts/ inside it); run numbers those files.
  const r = await ENDPOINT_CALLS[task.endpoint]({ key: KEY, timeoutMs, outDir: dirname(resolve(out)), run }, model, task);
  rec.firstOutputMs = r.firstOutputMs;
  rec.totalMs = r.totalMs;
  rec.cost = Number((r.cost ?? 0).toFixed(6));
  if (r.provider) rec.providers.push(r.provider);
  rec.answer = r.answer;
  rec.error = r.error;
  rec.ok = !r.error && r.answer !== null;
  if (r.raw) rec.raw = r.raw;
  if (r.artifact) rec.artifact = r.artifact;
  emit({ kind: 'agent.end', node: 'runner.loop', model, status: rec.error ? 'error' : 'ok', duration_ms: rec.totalMs, ...(rec.error && { message: rec.error.slice(0, 120) }) });
  emit({ kind: 'usage', node: 'measure.cost', model, cost_usd: rec.cost });
  return rec;
}

async function runOne(model, task, run, session, warm) {
  const rec = {
    date: today, category: task.category, task: task.id, model, run, warm, effort, ok: false,
    firstOutputMs: null, totalMs: 0, steps: 0, retries: 0,
    promptTokens: 0, completionTokens: 0, cachedTokens: 0, cachedFirstStep: null, cost: 0,
    providers: [], answer: null, error: null,
  };
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: userContent(task, task.prompt) }];
  const tools = task.tools.length ? [...task.tools.map((t) => TOOL_DEFS[t]), FINISH] : undefined;
  const t0 = performance.now();
  // The loop node lights for the whole run; `session` is the run id, and the message names the run in words.
  emit({ kind: 'agent.start', node: 'runner.loop', model, session, message: `${task.category}/${task.id} run ${run}${warm ? ' (warm)' : ''}` });
  try {
    for (let step = 1; step <= task.steps; step++) {
      // The batch path sends this exact body for step 1: one shared builder keeps the two in step.
      const body = stepBody(model, task, session, messages);
      let r;
      try { r = await call(body); } catch (e) {
        if (!e.retry) throw e;
        rec.retries++; // the lost attempt may still be billed: report.mjs shows retries next to cost
        r = await call(body);
      }
      rec.steps = step;
      if (r.first !== null && rec.firstOutputMs === null) rec.firstOutputMs = Math.round(performance.now() - t0 - r.ms + r.first);
      const u = r.usage ?? {};
      rec.promptTokens += u.prompt_tokens ?? 0;
      rec.completionTokens += u.completion_tokens ?? 0;
      const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
      rec.cachedTokens += cached;
      if (step === 1) rec.cachedFirstStep = cached;
      rec.cost += u.cost ?? 0;
      if (r.provider && !rec.providers.includes(r.provider)) rec.providers.push(r.provider);
      if (!tools) { rec.answer = r.content; rec.ok = true; break; }
      messages.push({ role: 'assistant', content: r.content || null, ...(r.toolCalls.length && { tool_calls: r.toolCalls }) });
      if (!r.toolCalls.length) {
        // A model that answers in plain text has finished, in practice: keep the answer, judge it like any other.
        rec.answer = r.content; rec.ok = true; break;
      }
      let done = false;
      for (const c of r.toolCalls) {
        let a = {};
        try { a = JSON.parse(c.function.arguments || '{}'); } catch { /* the tool reports it */ }
        if (c.function.name === 'finish') { rec.answer = String(a.answer ?? ''); rec.ok = true; done = true; break; }
        let result;
        try {
          if (!task.tools.includes(c.function.name)) throw new Error(`unknown tool ${c.function.name}`);
          result = readFixture(task, a.path);
        } catch (e) { result = `ERROR: ${e.message}`; }
        messages.push({ role: 'tool', tool_call_id: c.id, content: result });
      }
      if (done) break;
      if (step === task.steps) {
        rec.error = `step cap ${task.steps}`;
        emit({ kind: 'error', node: 'runner.cap', model, session, status: 'error', message: rec.error });
      }
    }
  } catch (e) {
    rec.error = e.message;
  }
  rec.totalMs = Math.round(performance.now() - t0);
  rec.cost = Number(rec.cost.toFixed(6));
  emit({ kind: 'agent.end', node: 'runner.loop', model, session, status: rec.error ? 'error' : 'ok', duration_ms: rec.totalMs, ...(rec.error && { message: rec.error.slice(0, 120) }) });
  // Measurements, per run: the spend and the first output that a voice or UI role cares about.
  emit({ kind: 'usage', node: 'measure.cost', model, session, tokens: rec.promptTokens + rec.completionTokens, cost_usd: rec.cost });
  if (rec.firstOutputMs !== null) emit({ kind: 'log', node: 'measure.first', model, session, duration_ms: rec.firstOutputMs, message: `first output ${rec.firstOutputMs} ms` });
  return rec;
}

mkdirSync(dirname(resolve(out)), { recursive: true });
let n = 0, spent = 0;
// One line per run, written as it finishes: the cold run first, then (with --warm) the warm repeat on the same session.
const write = (rec, task, run) => {
  appendFileSync(out, `${JSON.stringify(rec)}\n`);
  // The record is on disk: one line appended per run, as the jsonl node promises.
  emit({ kind: 'log', node: 'runner.jsonl', model: rec.model, message: `wrote ${task.category}/${task.id} run ${run}${rec.warm ? ' (warm)' : ''}` });
  spent += rec.cost;
  // A batch has no per-request timing: `totalMs` is null there, so the sync column shows nothing for it.
  const secs = rec.totalMs == null ? '-' : `${(rec.totalMs / 1000).toFixed(1)}s`;
  const cachedPct = rec.promptTokens ? Math.round((100 * rec.cachedTokens) / rec.promptTokens) : 0;
  console.log(`[${++n}/${calls}] ${rec.model} ${task.id} #${run}${rec.warm ? ' (warm)' : ''}${rec.batch ? ' [batch]' : ''}: ${rec.error ? `ERROR ${rec.error.slice(0, 80)}` : 'answered'}`
    + ` · ${secs} · ${rec.steps} steps · $${rec.cost.toFixed(4)} · cache ${cachedPct}%`);
};

if (batch) {
  // One batch per model, every eligible task × run inside it. The warning is printed once, before any request.
  console.log(`\n${BATCH_WARNING}`);
  const written = await runBatch({
    key: KEY, models, tasks: batchTasks, runs, effort, date: today,
    body: (model, task, session) => stepBody(model, task, session),
    write, emit, log: console.log,
    waitMinutes: Number(arg('batch-wait', 720)),
  });
  console.log(`\ndone: ${written} batch run(s), $${spent.toFixed(4)} in total → ${out}\nnext: node scripts/judge.mjs --in ${out} --tasks ${tasksPath}`);
  exit(0);
}
for (let run = 1; run <= runs; run++) {
  for (const task of tasks) {
    for (const model of models) {
      // The cold run owns the session_id; the warm repeat reuses it, so the cache is what the second run measures.
      const session = `bench-${model.replace(/\W+/g, '-')}-${task.id}-${run}-${Date.now()}`;
      if (task.endpoint !== 'chat') {
        write(await runEndpoint(model, task, run), task, run);
        continue;
      }
      write(await runOne(model, task, run, session, false), task, run);
      if (warm) write(await runOne(model, task, run, session, true), task, run);
    }
  }
}
console.log(`\ndone: ${n} runs, $${spent.toFixed(4)} in total → ${out}\nnext: node scripts/judge.mjs --in ${out} --tasks ${tasksPath}`);
