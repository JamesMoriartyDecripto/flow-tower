#!/usr/bin/env node
// Runs benchmark tasks through the squad's tool loop (tools/squad/run.mjs) for the architect and lead-judge roles (#447).
// The answers land in bench.mjs's line shape, so judge.mjs and report.mjs score them with the same code as the models.
//
//   node scripts/squad-loop.mjs --role architect --category planner --tasks tasks/planner --models a,b --out results/loop.jsonl
//   node scripts/squad-loop.mjs ... --dry-run     prints the plan and spawns nothing
//
// Every run writes its own cost ledger in a temp folder, so the benchmark never adds to the user's cost ledger.
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, env, exit } from 'node:process';
import { loadTasks } from './tasks.mjs';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const scriptDir = dirname(fileURLToPath(import.meta.url));

// Run-major, models interleaved: a slow hour or a provider incident hits every model alike, as in bench.mjs.
export function planJobs({ tasks, models, runs }) {
  const jobs = [];
  for (let run = 1; run <= runs; run++)
    for (const task of tasks) for (const model of models) jobs.push({ model, task, run });
  return jobs;
}

// A finished job is identified by its three fields; an interrupted run skips these on resume.
export function doneKey(line) {
  return JSON.stringify([line.model, line.task, line.run]);
}

// run.mjs prints `mode:`, `reviewed:` and `trimmed:` first and a `--- <model>` footer last. Only the last non-empty
// line is a footer, so a `--- ` line inside the answer is kept. The blank line before the footer is a separator.
const HEADER = ['mode: ', 'reviewed: ', 'trimmed: '];
export function reportOf(stdout) {
  const lines = String(stdout ?? '').split('\n');
  let head = 0;
  while (head < HEADER.length && head < lines.length && lines[head].startsWith(HEADER[head])) head++;
  let end = lines.length;
  let foot = lines.length - 1;
  while (foot >= head && lines[foot] === '') foot--;
  if (foot >= head && lines[foot].startsWith('--- ')) {
    end = foot;
    if (end > head && lines[end - 1] === '') end--;
  }
  return lines.slice(head, end).join('\n');
}

function runChild(args, ledger, timeoutS) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, args, {
      env: { ...env, SQUAD_LEDGER: ledger, FLOW_TOWER_URL: 'http://127.0.0.1:9' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutS * 1000);
    child.on('close', () => { clearTimeout(timer); ok({ stdout, timedOut }); });
  });
}

// The last ledger line holds this run's outcome and cost; no line at all means the runner died before recording.
function lastLedgerLine(path) {
  let text = '';
  try { text = readFileSync(path, 'utf8'); } catch { return null; }
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
}

async function runJob(job, ctx) {
  const { task, model, run } = job;
  const file = join(ctx.tmp, `${ctx.seq++}.md`);
  writeFileSync(file, task.prompt);
  const ledger = `${file}.jsonl`;
  const args = [join(ctx.squad, 'run.mjs'), '--role', ctx.role, '--model', model, '--task', file, '--repo', task.dir, '--issue', '0', '--steps', String(ctx.steps)];
  const t0 = Date.now();
  const { stdout, timedOut } = await runChild(args, ledger, ctx.timeout);
  const rec = lastLedgerLine(ledger);
  const outcome = timedOut ? 'timeout' : rec ? rec.outcome : 'crash';
  const ok = outcome === 'finish';
  const line = {
    date: new Date().toISOString().slice(0, 10), category: ctx.category, task: task.id, model, run, warm: false, effort: 'low',
    ok, firstOutputMs: null, totalMs: Date.now() - t0, steps: rec?.steps ?? 0, retries: 0,
    promptTokens: rec?.promptTokens ?? 0, completionTokens: 0, cachedTokens: rec?.cachedTokens ?? 0, cachedFirstStep: 0,
    cost: rec?.cost ?? null, providers: [], answer: ok ? reportOf(stdout) : null, error: ok ? null : outcome,
  };
  appendFileSync(ctx.out, `${JSON.stringify(line)}\n`);
  const cost = line.cost == null ? 'cost n/a' : `$${line.cost.toFixed(4)}`;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${model} ${task.id} run ${run} ${Math.round(line.totalMs / 100) / 10}s ${cost}${ok ? '' : ` (${outcome})`}`);
}

async function main() {
  const role = arg('role');
  const category = arg('category');
  const tasksDir = arg('tasks');
  const models = (arg('models') || '').split(',').map((m) => m.trim()).filter(Boolean);
  const out = arg('out');
  const only = (arg('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const runs = Number(arg('runs', 3));
  const parallel = Number(arg('parallel', 4));
  const steps = Number(arg('steps', 8));
  const timeout = Number(arg('timeout', 600));
  if (!['architect', 'lead-judge'].includes(role) || !category || !tasksDir || !models.length || !out || !(runs >= 1) || !(parallel >= 1)) {
    console.error('usage: squad-loop.mjs --role <architect|lead-judge> --category <name> --tasks <folder> --models a,b --out <file.jsonl> [--only id1,id2] [--runs 3] [--parallel 4] [--steps 8] [--squad <tools/squad>] [--timeout 600] [--dry-run]');
    exit(2);
  }
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: scriptDir, encoding: 'utf8' }).trim();
  const squad = resolve(arg('squad', join(repo, 'tools', 'squad')));
  const tasks = loadTasks(tasksDir).filter((t) => !only.length || only.includes(t.id));
  if (!tasks.length) {
    console.error(`no task left in ${tasksDir}${only.length ? ` for --only ${only.join(',')}` : ''}`);
    exit(1);
  }
  const jobs = planJobs({ tasks, models, runs });
  console.log(`${models.length} models × ${tasks.length} tasks × ${runs} runs = ${jobs.length} runs`);
  if (argv.includes('--dry-run')) exit(0);

  // Jobs already in --out are skipped, so an interrupted run resumes where it stopped.
  const done = new Set();
  try {
    for (const l of readFileSync(out, 'utf8').split('\n')) if (l.trim()) done.add(doneKey(JSON.parse(l)));
  } catch { /* no output yet */ }
  const todo = jobs.filter((j) => !done.has(doneKey({ model: j.model, task: j.task.id, run: j.run })));
  console.log(`${todo.length} to run, ${jobs.length - todo.length} already done`);

  const tmp = mkdtempSync(join(tmpdir(), 'squad-loop-'));
  const ctx = { role, category, squad, out, timeout, steps, tmp, seq: 0 };
  let next = 0;
  const worker = async () => {
    while (next < todo.length) await runJob(todo[next++], ctx);
  };
  try {
    await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, worker));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
