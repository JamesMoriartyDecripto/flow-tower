#!/usr/bin/env node
// Model benchmark runner: the same tasks, the same tool loop and the same prompt for every candidate,
// through OpenRouter. One JSON line per run, appended as it finishes, so a crash keeps what was paid for.
//
//   node scripts/bench.mjs --category coder --models a/x,b/y --tasks tasks/coder/ --runs 3 --out results/2026-10-11.jsonl
//   node scripts/bench.mjs ... --dry-run      prints the plan and checks the task files; needs no key
//
// The key comes only from OPENROUTER_API_KEY in the shell. It is never read from a file, printed or logged.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { loadTasks, taskProblems } from './tasks.mjs';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const dry = argv.includes('--dry-run');
const today = new Date().toISOString().slice(0, 10);
const category = arg('category');
const models = (arg('models') || '').split(',').map((m) => m.trim()).filter(Boolean);
const tasksPath = arg('tasks', category ? `tasks/${category}/` : undefined);
const runs = Number(arg('runs', 3));
const out = arg('out', `results/${today}.jsonl`);
const timeoutMs = Number(arg('timeout', 180)) * 1000;
const effort = arg('effort', 'low');

if (!tasksPath || !models.length || !(runs >= 1)) {
  console.error('usage: bench.mjs --category <c> --models a,b --tasks tasks/<c>/ --runs N --out results/<date>.jsonl [--timeout 180] [--effort low] [--dry-run]');
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

const calls = models.length * tasks.length * runs;
const maxCalls = models.length * runs * tasks.reduce((s, t) => s + t.steps, 0);
console.log(`\nplan: ${models.length} models × ${tasks.length} tasks × ${runs} runs = ${calls} runs (at most ${maxCalls} model calls, ${maxCalls * 2} with retries)`);
console.log(`models: ${models.join(', ')}`);
console.log(`order: run-major, models interleaved, so a slow hour or a provider incident hits every model alike`);
console.log(`output: ${out}  timeout: ${timeoutMs / 1000}s + 1 retry  effort: ${effort}`);
if (runs < 3) console.log('note: fewer than 3 runs per cell: label every result ILLUSTRATIVE');
if (broken) { console.error(`\n${broken} task problem(s): fix them before a real run`); exit(1); }
if (dry) exit(0);

const KEY = env.OPENROUTER_API_KEY;
if (!KEY) { console.error('OPENROUTER_API_KEY is not set in this shell (it is never read from a file)'); exit(2); }

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
class CallError extends Error { constructor(msg, retry) { super(msg); this.retry = retry; } }

async function call(body) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower model-benchmark' },
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) { throw new CallError(`no answer: ${e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : e.message}`, true); }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
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
    throw e instanceof CallError ? e : new CallError(`stream broke: ${e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : e.message}`, true);
  }
  return { first, ms: performance.now() - t0, content, toolCalls: toolCalls.filter(Boolean), usage, provider };
}

// 4. One run: a fresh session (cold cache at step 1, warm afterwards), capped steps, one retry per call.
async function runOne(model, task, run) {
  const rec = {
    date: today, category: task.category, task: task.id, model, run, effort, ok: false,
    firstOutputMs: null, totalMs: 0, steps: 0, retries: 0,
    promptTokens: 0, completionTokens: 0, cachedTokens: 0, cachedFirstStep: null, cost: 0,
    providers: [], answer: null, error: null,
  };
  const session = `bench-${model.replace(/\W+/g, '-')}-${task.id}-${run}-${Date.now()}`;
  const tools = task.tools.length ? [...task.tools.map((t) => TOOL_DEFS[t]), FINISH] : undefined;
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: task.prompt }];
  const t0 = performance.now();
  try {
    for (let step = 1; step <= task.steps; step++) {
      const body = {
        model, messages, max_tokens: 4000, usage: { include: true }, session_id: session,
        reasoning: { effort },
        // Every candidate gets the same data policy; an endpoint that cannot honour it is a result.
        provider: { require_parameters: true, data_collection: 'deny' },
        ...(tools && { tools }),
      };
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
      if (step === task.steps) rec.error = `step cap ${task.steps}`;
    }
  } catch (e) {
    rec.error = e.message;
  }
  rec.totalMs = Math.round(performance.now() - t0);
  rec.cost = Number(rec.cost.toFixed(6));
  return rec;
}

mkdirSync(dirname(resolve(out)), { recursive: true });
let n = 0, spent = 0;
for (let run = 1; run <= runs; run++) {
  for (const task of tasks) {
    for (const model of models) {
      const rec = await runOne(model, task, run);
      appendFileSync(out, `${JSON.stringify(rec)}\n`);
      spent += rec.cost;
      const cachedPct = rec.promptTokens ? Math.round((100 * rec.cachedTokens) / rec.promptTokens) : 0;
      console.log(`[${++n}/${calls}] ${model} ${task.id} #${run}: ${rec.error ? `ERROR ${rec.error.slice(0, 80)}` : 'answered'}`
        + ` · ${(rec.totalMs / 1000).toFixed(1)}s · ${rec.steps} steps · $${rec.cost.toFixed(4)} · cache ${cachedPct}%`);
    }
  }
}
console.log(`\ndone: ${n} runs, $${spent.toFixed(4)} in total → ${out}\nnext: node scripts/judge.mjs --in ${out} --tasks ${tasksPath}`);
