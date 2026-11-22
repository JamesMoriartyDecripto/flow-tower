#!/usr/bin/env node
// Runs benchmark tasks through the squad's tool loop (tools/squad/run.mjs) for the architect and lead-judge roles (#447).
// The answers land in bench.mjs's line shape, so judge.mjs and report.mjs score them with the same code as the models.
//
//   node scripts/squad-loop.mjs --role architect --category planner --tasks tasks/planner --models a,b --out results/loop.jsonl
//   node scripts/squad-loop.mjs ... --dry-run     prints the plan and spawns nothing
//
// Every run writes its own cost ledger in a temp folder, so the benchmark never adds to the user's cost ledger.
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argv, exit } from 'node:process';
import { loadTasks } from './tasks.mjs';
import { doneSet, pool, runSquad } from './squad-child.mjs';

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
function doneKey(line) {
  return JSON.stringify([line.model, line.task, line.run]);
}

async function runJob(job, ctx) {
  const { task, model, run } = job;
  const file = join(ctx.tmp, `${ctx.seq++}.md`);
  writeFileSync(file, task.prompt);
  const args = ['--role', ctx.role, '--model', model, '--task', file, '--repo', task.dir, '--issue', '0', '--steps', String(ctx.steps)];
  const { rec, outcome, seconds, stdout } = await runSquad({ runMjs: join(ctx.squad, 'run.mjs'), args, timeoutS: ctx.timeout, tmp: ctx.tmp });
  const ok = outcome === 'finish';
  const line = {
    date: new Date().toISOString().slice(0, 10), category: ctx.category, task: task.id, model, run, warm: false, effort: 'low',
    ok, totalMs: Math.round(seconds * 1000), steps: rec?.steps ?? 0,
    promptTokens: rec?.promptTokens ?? 0, cachedTokens: rec?.cachedTokens ?? 0,
    cost: rec?.cost ?? null, answer: ok ? ctx.reportOf(stdout) : null, error: ok ? null : outcome,
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
  const done = doneSet(out, doneKey);
  const todo = jobs.filter((j) => !done.has(doneKey({ model: j.model, task: j.task.id, run: j.run })));
  console.log(`${todo.length} to run, ${jobs.length - todo.length} already done`);

  const { reportOf } = await import(pathToFileURL(join(squad, 'runner-deps.mjs')).href);
  const tmp = mkdtempSync(join(tmpdir(), 'squad-loop-'));
  const ctx = { role, category, squad, out, timeout, steps, reportOf, tmp, seq: 0 };
  try {
    await pool(todo, parallel, (job) => runJob(job, ctx));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
