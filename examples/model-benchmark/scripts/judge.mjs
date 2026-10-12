#!/usr/bin/env node
// Judge the runs: each task's deterministic check first, then a blind file for the rubric.
//   node scripts/judge.mjs --in results/2026-10-11.jsonl --tasks tasks/coder/ [--tasks-root tasks] [--url http://127.0.0.1:5317]
// Writes next to the input:
//   <name>.judged.jsonl    every run + { check, pass, detail }
//   <name>.blind.md        rubric answers, shuffled, model names removed: give this to the verifier or a human
//   <name>.blind-key.json  blind id -> run; keep it away from whoever scores
//   <name>.scores.json     blind id -> null; the scorer fills 0-10 (see rubric.md)
// --url (or FLOW_TOWER_URL) posts metadata-only events to the tower's own model-benchmark.tower.yaml.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { argv, env, execPath, exit } from 'node:process';
import { live } from './live.mjs';
import { blocks, loadTasks } from './tasks.mjs';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
const input = arg('in');
const tasksPaths = argv.flatMap((a, i) => (a === '--tasks' ? [argv[i + 1]] : []));
if (!input || !tasksPaths.length) { console.error('usage: judge.mjs --in results/<date>.jsonl --tasks tasks/<c>/ [--tasks tasks/<d>/] [--url http://127.0.0.1:5317]'); exit(2); }
// Same tower URL rule as bench.mjs: the flag wins, the environment is the fallback, '' is a no-op.
const post = live(arg('url', env.FLOW_TOWER_URL || ''));
// Keep every POST so the end can await them: exit() would kill any still in flight.
const sent = [];
const emit = (e) => { sent.push(post(e)); };

const tasks = new Map(tasksPaths.flatMap(loadTasks).map((t) => [`${t.category}/${t.id}`, t]));
const runs = readFileSync(input, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// Answers often come wrapped in prose or a fence: take the fenced block if there is one, else the outermost brackets.
function extractJson(answer) {
  const fenced = blocks(answer, 'json')[0];
  for (const c of [fenced, answer.trim(), answer.slice(Math.min(...['{', '['].map((b) => answer.indexOf(b)).filter((i) => i >= 0)), Math.max(answer.lastIndexOf('}'), answer.lastIndexOf(']')) + 1)]) {
    if (!c) continue;
    try { return JSON.parse(c); } catch { /* next candidate */ }
  }
  return undefined;
}
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

function extractCode(answer) {
  const all = [...answer.matchAll(/```(?:js|javascript|mjs|ts|typescript)?\n([\s\S]*?)```/g)].map((m) => m[1]);
  return all.length ? all[all.length - 1] : answer;
}

// The check scripts import model-written code: run them in a child Node with the permission model on,
// so the answer can read only its own temp folder and the task folder, and cannot spawn processes or write.
function runCommand(task, answer) {
  // Real paths: the permission model refuses to stat a symlinked parent such as macOS /var or /tmp.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bench-judge-')));
  const taskDir = realpathSync(task.dir);
  try {
    writeFileSync(join(dir, 'answer.mjs'), extractCode(answer));
    execFileSync(execPath, [
      '--experimental-permission', `--allow-fs-read=${dir}`, `--allow-fs-read=${taskDir}`,
      join(taskDir, task.command), join(dir, 'answer.mjs'),
    ], { timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return { pass: true, detail: 'check exited 0' };
  } catch (e) {
    const lines = (e.stderr || e.stdout || e.message || '').toString().split('\n').map((l) => l.trim()).filter(Boolean);
    const why = e.signal ? `killed (${e.signal}): timeout?` : lines.find((l) => /Error|assert/i.test(l)) ?? lines.at(-1) ?? 'unknown';
    return { pass: false, detail: `check failed: ${why.slice(0, 200)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function check(task, answer) {
  // One judge node event per deterministic check. `tool` names the check kind; the detail never travels
  // (it can quote the answer), only the verdict does.
  emit({ kind: 'tool.start', node: 'judges.check', tool: task.check, model: task.id, message: `${task.category}/${task.id}` });
  const done = (r) => { emit({ kind: 'tool.end', node: 'judges.check', tool: task.check, model: task.id, status: r.pass === false ? 'error' : 'ok' }); return r; };
  if (task.check === 'rubric') return done({ pass: null, detail: 'rubric only' });
  if (task.check === 'command') return done(runCommand(task, answer));
  if (task.check === 'json') {
    const got = extractJson(answer);
    const want = JSON.parse(blocks(task.expected, 'json')[0]);
    if (got === undefined) return done({ pass: false, detail: 'no JSON in the answer' });
    const same = JSON.stringify(canon(got)) === JSON.stringify(canon(want));
    return done({ pass: same, detail: same ? 'exact match' : `got ${JSON.stringify(got).slice(0, 160)}` });
  }
  // regex: every line of every ```regex block must match; a ```must-not line must not.
  const must = blocks(task.expected, 'regex').flatMap((b) => b.split('\n')).filter(Boolean);
  const mustNot = blocks(task.expected, 'must-not').flatMap((b) => b.split('\n')).filter(Boolean);
  const missing = must.filter((r) => !new RegExp(r, 'i').test(answer));
  const wrong = mustNot.filter((r) => new RegExp(r, 'i').test(answer));
  const pass = !missing.length && !wrong.length;
  return done({ pass, detail: pass ? 'all patterns found' : [missing.length && `missing ${missing.join(' ; ')}`, wrong.length && `should not say ${wrong.join(' ; ')}`].filter(Boolean).join('; ') });
}

const judged = runs.map((r) => {
  const task = tasks.get(`${r.category}/${r.task}`);
  if (!task) return { ...r, check: null, pass: null, detail: 'task file not given to judge.mjs' };
  if (r.error || r.answer == null) return { ...r, check: task.check, rubric: task.rubric, pass: false, detail: `no answer: ${r.error ?? 'empty'}` };
  return { ...r, check: task.check, rubric: task.rubric, ...check(task, r.answer) };
});

// Blind file: shuffled, numbered, no model, provider, cost or timing, so the scorer cannot favour a name.
const rubricRuns = judged.filter((r) => tasks.get(`${r.category}/${r.task}`)?.rubric && r.answer != null && r.pass !== false);
const shuffled = rubricRuns.map((r) => [Math.random(), r]).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
const key = {}, scores = {};
const md = ['# Blind rubric sheet', '', 'Score each answer 0-10 against its task rubric and rubric.md. You do not know which model wrote it; do not try to guess.', ''];
shuffled.forEach((r, i) => {
  const id = `B${String(i + 1).padStart(3, '0')}`;
  const t = tasks.get(`${r.category}/${r.task}`);
  key[id] = { model: r.model, category: r.category, task: r.task, run: r.run };
  scores[id] = null;
  md.push(`## ${id} · ${t.category}/${t.id}: ${t.title}`, '', '### Task rubric', '', t.expected, '', '### Answer', '', '````text', r.answer.trim(), '````', '');
});

const base = resolve(input).replace(/\.jsonl$/, '');
writeFileSync(`${base}.judged.jsonl`, judged.map((r) => JSON.stringify(r)).join('\n') + '\n');
if (shuffled.length) {
  writeFileSync(`${base}.blind.md`, md.join('\n'));
  writeFileSync(`${base}.blind-key.json`, JSON.stringify(key, null, 2) + '\n');
  // Never overwrite scores someone already filled in.
  if (!existsSync(`${base}.scores.json`)) writeFileSync(`${base}.scores.json`, JSON.stringify(scores, null, 2) + '\n');
  // A count only: the sheet holds the answers, and none of that text may travel in an event.
  emit({ kind: 'log', node: 'judges.blind', message: `${shuffled.length} answers in ${base}.blind.md` });
}
// Scores already on disk are read (never overwritten) so the file's state is visible in the feed.
const scoresPath = `${base}.scores.json`;
let filled = 0;
try { if (existsSync(scoresPath)) filled = Object.values(JSON.parse(readFileSync(scoresPath, 'utf8'))).filter((s) => s != null).length; } catch { /* a malformed sheet stays the scorer's problem */ }
emit({ kind: 'log', node: 'judges.scores', message: `${filled} scores read from ${base}.scores.json` });

await Promise.allSettled(sent);
const pass = judged.filter((r) => r.pass === true).length, fail = judged.filter((r) => r.pass === false).length;
console.log(`${judged.length} runs: ${pass} pass, ${fail} fail, ${judged.length - pass - fail} pending (rubric only)`);
for (const r of judged.filter((x) => x.pass === false)) console.log(`  fail ${r.model} ${r.task} #${r.run}: ${r.detail}`);
console.log(`wrote ${base}.judged.jsonl${shuffled.length ? `, ${shuffled.length} answers in ${base}.blind.md (score them in ${base}.scores.json)` : ''}`);
