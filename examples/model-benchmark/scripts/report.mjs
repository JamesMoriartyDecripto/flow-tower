#!/usr/bin/env node
// Results table per category, from the judged runs and (optionally) the blind rubric scores.
//   node scripts/report.mjs --in results/2026-10-11.judged.jsonl [--scores results/2026-10-11.scores.json] [--pass-score 7] [--out results/2026-10-11.md]
// The blind key is found next to the scores file (<name>.blind-key.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
const input = arg('in');
if (!input) { console.error('usage: report.mjs --in <name>.judged.jsonl [--scores <name>.scores.json] [--pass-score 7] [--out <file>.md]'); exit(2); }
const passScore = Number(arg('pass-score', 7));
const runs = readFileSync(input, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// Rubric scores come back keyed by blind id; the key maps them to runs only now, after scoring.
const scoresFile = arg('scores');
const byRun = new Map();
if (scoresFile) {
  const scores = JSON.parse(readFileSync(scoresFile, 'utf8'));
  const keyFile = scoresFile.replace(/\.scores\.json$/, '.blind-key.json');
  if (!existsSync(keyFile)) { console.error(`blind key not found: ${keyFile}`); exit(2); }
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  for (const [id, s] of Object.entries(scores)) if (s != null && key[id]) byRun.set(JSON.stringify(key[id]), Number(s));
}
const runKey = (r) => JSON.stringify({ model: r.model, category: r.category, task: r.task, run: r.run });

// Final verdict: the deterministic check must pass, and a rubric task also needs its score.
function verdict(r) {
  if (r.pass === false) return false;
  if (!r.rubric) return r.pass;
  const s = byRun.get(runKey(r));
  return s === undefined ? null : s >= passScore;
}

const median = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
// A batch run has no per-request timing to report: `firstOutputMs` is null, and an en dash marks that.
const sec = (ms) => (ms == null ? '-' : (ms / 1000).toFixed(1));
const usd = (x) => (x == null ? '-' : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');

const lines = [];
const categories = [...new Set(runs.map((r) => r.category))].sort();
const dates = [...new Set(runs.map((r) => r.date))].sort();
lines.push(`# Model benchmark results`, '', `Measured ${dates.join(', ')} through OpenRouter (\`require_parameters\`, \`data_collection: deny\`, effort ${[...new Set(runs.map((r) => r.effort))].join('/')}).`, '');

for (const cat of categories) {
  const rs = runs.filter((r) => r.category === cat);
  const models = [...new Set(rs.map((r) => r.model))];
  const tasks = [...new Set(rs.map((r) => r.task))];
  // Warm repeats double the lines, not the runs: the "runs each" count and the ILLUSTRATIVE label stay on cold runs.
  const minRuns = Math.min(...models.flatMap((m) => tasks.map((t) => rs.filter((r) => r.model === m && r.task === t && r.warm !== true).length)));
  const label = minRuns < 3 ? ' (ILLUSTRATIVE: fewer than 3 runs per model and task)' : '';
  lines.push(`## ${cat}${label}`, '', `${tasks.length} task${tasks.length === 1 ? '' : 's'} (${tasks.join(', ')}), ${minRuns}+ runs each.${models.length < 5 ? ` Only ${models.length} models: the goal is at least 5.` : ''}`, '');
  // --warm writes a second line per run: the cold ones keep the table's meaning, the warm ones get their own
  // columns, so the price of a warm cache is visible without moving the cold numbers. A line without the field is cold.
  const hasWarm = rs.some((r) => r.warm === true);
  const head = ['Model', 'Runs', 'Correct', 'Total s, median [min-max]', 'First output s', 'Steps', '$ / run'];
  if (hasWarm) head.push('$ / run warm');
  head.push('$ / correct', 'Cached %, warm starts');
  if (hasWarm) head.push('cached % warm');
  head.push('Retries', 'Errors', 'Providers');
  lines.push(`| ${head.join(' | ')} |`);
  lines.push(`|${'---|'.repeat(head.length)}`);
  const rows = models.map((m) => {
    const mr = rs.filter((r) => r.model === m);
    // Cold only: the warm repeats are reported in their own two columns.
    const cold = mr.filter((r) => r.warm !== true);
    // Batch lines are labelled on the row; a row of only batch lines has no first-output timing at all.
    const labeled = mr.some((r) => r.batch === true);
    const allBatch = cold.length > 0 && cold.every((r) => r.batch === true);
    const mrWarm = mr.filter((r) => r.warm === true);
    const v = cold.map(verdict);
    const correct = v.filter((x) => x === true).length, pending = v.filter((x) => x === null).length;
    const totals = cold.map((r) => r.totalMs);
    // A batch line has no total either: the min/max line must ignore nulls rather than read them as 0.
    const timed = totals.filter((x) => x != null);
    const cost = cold.reduce((s, r) => s + (r.cost ?? 0), 0);
    // Cost per correct answer counts every run, failed ones included: that is what a node pays.
    const perCorrect = correct ? cost / correct : null;
    const prompt = cold.reduce((s, r) => s + r.promptTokens, 0), cached = cold.reduce((s, r) => s + r.cachedTokens, 0);
    const warmStarts = cold.filter((r) => r.cachedFirstStep > 0).length;
    const errors = [...new Set(cold.filter((r) => r.error).map((r) => r.error.replace(/\s+/g, ' ').slice(0, 40)))];
    const cells = [
      `\`${m}\`${labeled ? ' (batch)' : ''}`, cold.length, `${correct}/${cold.length}${pending ? ` (${pending} unscored)` : ''}`,
      `${sec(median(timed))} [${timed.length ? `${sec(Math.min(...timed))}-${sec(Math.max(...timed))}` : '-'}]`,
      allBatch ? '–' : sec(median(cold.map((r) => r.firstOutputMs))), median(cold.map((r) => r.steps)) ?? '-',
      usd(median(cold.map((r) => r.cost))),
    ];
    if (hasWarm) cells.push(usd(median(mrWarm.map((r) => r.cost))));
    cells.push(perCorrect == null ? 'none correct' : usd(perCorrect), `${pct(cached, prompt)}, ${warmStarts}/${cold.length} warm`);
    if (hasWarm) cells.push(pct(mrWarm.reduce((s, r) => s + r.cachedTokens, 0), mrWarm.reduce((s, r) => s + r.promptTokens, 0)));
    cells.push(mr.reduce((s, r) => s + (r.retries ?? 0), 0),
      errors.join('; ').replace(/\|/g, '/') || '-', [...new Set(mr.flatMap((r) => r.providers ?? []))].join(', ') || '-');
    return { perCorrect, correct, cells };
  });
  // Best value first: most correct, then cheapest per correct answer.
  rows.sort((a, b) => b.correct - a.correct || (a.perCorrect ?? Infinity) - (b.perCorrect ?? Infinity));
  for (const r of rows) lines.push(`| ${r.cells.join(' | ')} |`);
  lines.push('');
}
lines.push('Correct: deterministic check, plus a blind rubric score >= ' + passScore + ' where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.');

const text = lines.join('\n') + '\n';
const out = arg('out');
if (out) { writeFileSync(out, text); console.error(`wrote ${out}`); } else console.log(text);
