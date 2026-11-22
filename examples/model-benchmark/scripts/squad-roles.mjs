#!/usr/bin/env node
// Runs packed review tasks through the dev squad's own runner (tools/squad/run.mjs), one request per run, and scores
// each answer with squad-score.mjs (#447). The October squad benchmark had no committed driver, so it could not be
// repeated; this one is the committed driver.
//
//   node scripts/squad-roles.mjs --cases tasks/squad-review/cases.json --packs <dir> --models a,b --out results/roles.jsonl
//   node scripts/squad-roles.mjs --report results/roles.jsonl
//   node scripts/squad-roles.mjs ... --dry-run     prints the plan and checks the packs; spawns nothing
//
// A pack is <packs>/<case id>.<role>.md. Every run writes its own cost ledger in a temp folder, so the benchmark
// never adds to the user's cost ledger, and it posts no live events.
import { appendFileSync, mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argv, exit } from 'node:process';
import { scoreRun, summarize, table } from './squad-score.mjs';
import { doneSet, pool, runSquad } from './squad-child.mjs';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const scriptDir = dirname(fileURLToPath(import.meta.url));

// Run-major, models interleaved: a slow hour or a provider incident hits every model alike, as in bench.mjs.
export function planJobs({ cases, roles, models, runs }) {
  const jobs = [];
  for (let run = 1; run <= runs; run++)
    for (const c of cases) for (const role of roles) for (const model of models) jobs.push({ model, role, case: c, run });
  return jobs;
}

// A finished job is identified by its four fields; an interrupted run skips these on resume.
function doneKey(line) {
  return JSON.stringify([line.model, line.role, line.case, line.run]);
}

const packFile = (packs, c, role) => join(packs, `${c.id}.${role}.md`);

// Reads a file as the case's head commit sees it. Anything odd in the path is refused before git runs.
function readAt(repo, head) {
  return (path) => {
    if (!path || path.includes('..') || path.startsWith('/')) return null;
    try {
      return execFileSync('git', ['show', `${head}:${path}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  };
}

async function runJob(job, ctx) {
  const { case: c, role, model, run } = job;
  const pack = packFile(ctx.packs, c, role);
  const args = ['--role', role, '--model', model, '--task', pack, '--oneshot', '--issue', String(c.issue), '--repo', ctx.repo];
  const { rec, outcome, seconds, stdout } = await runSquad({ runMjs: join(ctx.squad, 'run.mjs'), args, timeoutS: ctx.timeout, tmp: ctx.tmp });
  const answer = ctx.reportOf(stdout);
  const { parseVerdict, checkFinding } = ctx.gate;
  const score = scoreRun({ kase: c, outcome, answer, readFile: readAt(ctx.repo, c.head), parseVerdict, checkFinding });
  const line = {
    ts: new Date().toISOString(), role, model, case: c.id, kind: c.kind, run, seconds, outcome,
    cost: rec?.cost ?? null, promptTokens: rec?.promptTokens ?? 0, cachedTokens: rec?.cachedTokens ?? 0,
    ...score, answer,
  };
  appendFileSync(ctx.out, `${JSON.stringify(line)}\n`);
  const cost = line.cost == null ? 'cost n/a' : `$${line.cost.toFixed(4)}`;
  console.log(`${score.pass ? 'ok  ' : 'FAIL'} ${model} ${role} ${c.id} ${seconds}s ${cost}${score.failure ? ` (${score.failure})` : ''}`);
}

function report(file) {
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  console.log(table(summarize(lines)));
}

// Scores a stored line again against a changed case. The outcome and answer were paid for once and are kept;
// only the case key and the score fields are replaced.
export function rescoreLine(line, kase, deps) {
  const score = scoreRun({ kase, outcome: line.outcome, answer: line.answer, ...deps });
  return { ...line, case: kase.id, kind: kase.kind, ...score };
}

async function rescore({ repo, gate }) {
  const src = arg('rescore');
  const casesPath = arg('cases');
  const out = arg('out');
  if (!src || !casesPath || !out) {
    console.error('usage: squad-roles.mjs --rescore <in.jsonl> --cases <cases.json> --out <out.jsonl> [--squad <tools/squad>] [--repo <git repo>] [--rename old=new,old2=new2]');
    exit(2);
  }
  // Reading and writing the same file would lose lines halfway, so the output must be a new path.
  if (out === src) {
    console.error('--out must differ from --rescore');
    exit(2);
  }
  const rename = Object.fromEntries((arg('rename') || '').split(',').filter(Boolean).map((p) => p.split('=')));
  const cases = new Map(JSON.parse(readFileSync(casesPath, 'utf8')).cases.map((c) => [c.id, c]));
  const lines = readFileSync(src, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

  let dropped = 0;
  let changed = 0;
  const kept = [];
  for (const line of lines) {
    const kase = cases.get(rename[line.case] ?? line.case);
    if (!kase) {
      dropped++;
      continue;
    }
    const next = rescoreLine(line, kase, { parseVerdict: gate.parseVerdict, checkFinding: gate.checkFinding, readFile: readAt(repo, kase.head) });
    if (next.pass !== line.pass) changed++;
    kept.push(next);
  }
  writeFileSync(out, kept.map((l) => `${JSON.stringify(l)}\n`).join(''));
  console.log(`rescored ${kept.length} lines, dropped ${dropped}, pass changed on ${changed}`);
}

async function main() {
  if (argv.includes('--report')) return report(arg('report'));
  const repo = arg('repo', execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: scriptDir, encoding: 'utf8' }).trim());
  const squad = resolve(arg('squad', join(repo, 'tools', 'squad')));
  const gate = await import(pathToFileURL(join(squad, 'gate.mjs')).href);
  if (argv.includes('--rescore')) return rescore({ repo, gate });
  const casesPath = arg('cases');
  const packs = arg('packs');
  const models = (arg('models') || '').split(',').map((m) => m.trim()).filter(Boolean);
  const out = arg('out');
  const roles = (arg('roles', 'reviewer,security')).split(',').map((r) => r.trim()).filter(Boolean);
  const runs = Number(arg('runs', 3));
  const parallel = Number(arg('parallel', 4));
  const timeout = Number(arg('timeout', 600));
  if (!casesPath || !packs || !models.length || !out || !(runs >= 1) || !(parallel >= 1)) {
    console.error('usage: squad-roles.mjs --cases <cases.json> --packs <dir> --models a,b --out <file.jsonl> [--roles reviewer,security] [--runs 3] [--parallel 4] [--squad <tools/squad>] [--repo <git repo>] [--timeout 600] [--dry-run]');
    console.error('       squad-roles.mjs --report <file.jsonl>');
    exit(2);
  }
  const cases = JSON.parse(readFileSync(casesPath, 'utf8')).cases;

  // Every pack must exist before any money is spent: a missing one is listed and the run stops.
  const missing = cases.flatMap((c) => roles.map((role) => packFile(packs, c, role))).filter((p) => !existsSync(p));
  if (missing.length) {
    console.error(`missing packs:\n${missing.map((p) => `  ${p}`).join('\n')}`);
    exit(1);
  }
  const jobs = planJobs({ cases, roles, models, runs });
  console.log(`${models.length} models × ${cases.length} cases × ${roles.length} roles × ${runs} runs = ${jobs.length} runs`);
  console.log(`packs: ${cases.length * roles.length} found · output: ${out} · parallel ${parallel} · timeout ${timeout}s`);
  if (argv.includes('--dry-run')) exit(0);

  // Jobs already in --out are skipped, so an interrupted run resumes where it stopped.
  const done = doneSet(out, doneKey);
  const todo = jobs.filter((j) => !done.has(doneKey({ model: j.model, role: j.role, case: j.case.id, run: j.run })));
  console.log(`${todo.length} to run, ${jobs.length - todo.length} already done`);

  const { reportOf } = await import(pathToFileURL(join(squad, 'runner-deps.mjs')).href);
  const tmp = mkdtempSync(join(tmpdir(), 'squad-roles-'));
  const ctx = { packs, repo, squad, out, timeout, gate, reportOf, tmp };
  try {
    await pool(todo, parallel, (job) => runJob(job, ctx));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
