#!/usr/bin/env node
// Run evals/questions.md through the answer flow and write the gap report.
// Usage: node eval.mjs [--dry-run] [--model <id>] [--judge-model <id>] [--out <gaps.md>] [--only Q3,Q7] [--runs N] [--whole-bytes <n>]
// A question fails on a wrong route, a bad citation or a judge verdict of fail. --dry-run runs the same
// pipeline offline against a mock writer and a mock judge (see answer.mjs): a smoke test, not a model score.
// Each question runs N times (default 3) and passes on the majority: the same docs scored 15/24 then 11/24 live.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { answer } from './answer.mjs';
import { chat, DEFAULT_JUDGE_MODEL, DEFAULT_MODEL, EXAMPLE, LOAD_WHOLE_BYTES, prompt, resolveKey } from './lib.mjs';

const args = argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const dryRun = args.includes('--dry-run');
const model = flag('--model', DEFAULT_MODEL);
const judgeModel = flag('--judge-model', DEFAULT_JUDGE_MODEL);
const out = flag('--out', join(EXAMPLE, 'gaps.md'));
const only = flag('--only', '')?.split(',').filter(Boolean);
const wholeBytes = Number(flag('--whole-bytes')) || LOAD_WHOLE_BYTES;
// The dry run is deterministic, so one pass is enough; live runs repeat to average out model noise.
const runs = dryRun ? 1 : Math.max(1, Number(flag('--runs', '3')) || 3);
// Fail before the first question and before the report: a missing key used to surface per question, after
// a partial run had already overwritten gaps.md.
if (!dryRun && !resolveKey()) {
  console.error('no OpenRouter key: export OPENROUTER_API_KEY, or put it in the user folder key file; --dry-run runs offline');
  exit(2);
}

/** Parse `## Qn. question` blocks with `- docs:` and `- facts:` lines. */
function parse(md) {
  return md.split(/^## /m).slice(1).map((block) => {
    const [title, ...lines] = block.trim().split('\n');
    const m = /^(Q\d+)\.\s*(.*)$/.exec(title);
    const field = (k) => lines.find((l) => l.startsWith(`- ${k}:`))?.slice(k.length + 3).trim() ?? '';
    return m && { id: m[1], q: m[2], docs: field('docs').split(',').map((s) => s.trim()).filter(Boolean), facts: field('facts').split(' | ').map((s) => s.trim()).filter(Boolean) };
  }).filter(Boolean);
}

const questions = parse(readFileSync(join(EXAMPLE, 'evals/questions.md'), 'utf8')).filter((x) => !only?.length || only.includes(x.id));
if (!questions.length) { console.error('no questions parsed'); exit(1); }

const hasFact = (text, f) => f.split(' / ').some((alt) => text.toLowerCase().includes(alt.toLowerCase()));

/**
 * Judge one answer: the model sees the question, the answer and the expected facts as reference, never
 * which model answered. It decides whether a user could act on the answer, so a missing implementation
 * detail is not a fail and a missing step is. A reply we cannot parse counts as a fail: no verdict, no pass.
 */
async function judge(x, text, { dryRun }) {
  if (dryRun) return { verdict: x.facts.every((f) => hasFact(text, f)) ? 'pass' : 'fail', missing: x.facts.filter((f) => !hasFact(text, f)), wrong: [], mock: true, tokens: 0, cost: 0 };
  const ask = `${prompt('judge')}\n\nQuestion: ${x.q}\n\nAnswer:\n${text}\n\nKey facts the docs hold:\n${x.facts.map((f) => `- ${f}`).join('\n')}`;
  try {
    const r = await chat(judgeModel, [{ role: 'system', content: 'You grade one documentation answer. Reply with JSON only.' }, { role: 'user', content: ask }]);
    const j = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const verdict = j.verdict === 'pass' ? 'pass' : 'fail';
    return { verdict, missing: (j.missing ?? []).map(String), wrong: (j.wrong ?? []).map(String), tokens: r.tokens, cost: r.cost };
  } catch (e) {
    return { verdict: 'fail', missing: [], wrong: [`judge error: ${e.message}`], tokens: 0, cost: 0 };
  }
}

/** One pass: route, citation guard, then the judge. Returns the reasons it failed (empty = pass). */
async function attempt(x) {
  try {
    const res = await answer(x.q, { model, dryRun, wholeBytes });
    const reasons = [];
    if (!res.stats.docs_loaded.some((d) => x.docs.includes(d))) reasons.push(`wrong route: ${res.stats.docs_loaded.join(', ')}`);
    // The guard runs in a dry run too: the mock writer answers nothing useful, but a broken guard call
    // must not hide offline.
    if (!res.guard?.ok) reasons.push(`bad citation: ${res.guard?.problems.join('; ')}`);
    const j = await judge(x, res.text, { dryRun });
    if (j.verdict !== 'pass') reasons.push(`judge: fail${j.missing.length ? `, missing ${j.missing.join('; ')}` : ''}${j.wrong.length ? `, wrong ${j.wrong.join('; ')}` : ''}`);
    return { pass: !reasons.length, reasons, judge: j, routed: res.stats.docs_loaded, whole: res.stats.loaded_whole ?? [], sections: res.stats.loaded_sections ?? [], bytes: res.stats.loaded_bytes ?? 0, tokens: res.stats.tokens + j.tokens, cost: res.stats.cost + j.cost, ms: res.stats.ms, cites: res.guard?.cites ?? [], fixed: res.stats.citations_fixed ?? 0 };
  } catch (e) {
    return { pass: false, reasons: [`error: ${e.message}`], judge: { verdict: 'fail', missing: [], wrong: [] }, routed: [], whole: [], sections: [], bytes: 0, tokens: 0, cost: 0, ms: 0, cites: [], fixed: 0 };
  }
}

const rows = [];
let cost = 0;
let tokens = 0;
for (const x of questions) {
  const tries = [];
  for (let i = 0; i < runs; i++) tries.push(await attempt(x));
  const passed = tries.filter((t) => t.pass).length;
  const last = tries.at(-1);
  const fail = tries.find((t) => !t.pass);
  for (const t of tries) { cost += t.cost; tokens += t.tokens; }
  const row = { ...x, tries: runs, passed, pass: passed * 2 > runs, reasons: fail?.reasons ?? [], judge: fail?.judge ?? last.judge, routed: fail?.routed ?? last.routed, whole: last.whole, sections: last.sections, bytes: last.bytes, cites: last.cites, fixed: last.fixed };
  rows.push(row);
  console.log(`${x.id} ${row.pass ? 'pass' : 'FAIL'} ${passed}/${runs}  ${row.routed.join(', ')}${row.pass ? '' : `  <- ${row.reasons.join(' / ')}`}`);
}

const passed = rows.filter((r) => r.pass).length;
const fails = rows.filter((r) => !r.pass);
const score = `${passed}/${rows.length}`;
const loaded = (r) => [...r.whole.map((d) => `${d} (whole)`), ...r.sections.map((d) => `${d} (sections)`), `${r.bytes} B`].join(', ');
const md = [
  '# Doc gaps',
  '',
  `Latest run: ${new Date().toISOString().slice(0, 16)}Z, ${dryRun ? '**dry run: mock model, mock judge, keyword router, one pass** (routing, JIT loading, citations and scoring; no real answers)' : `model \`${model}\`, ${runs} runs per question (majority pass)`}, docs loaded whole up to ${wholeBytes} B.`,
  '',
  `**Score: ${score}** judged by ${dryRun ? 'the mock judge (keyword rule): nothing was answered, so this is a pipeline smoke test, not a quality score' : `\`${judgeModel}\` (route, citation guard and judge, majority pass)`}.${dryRun ? '' : ` Tokens ${tokens}, cost $${cost.toFixed(4)}.`}`,
  '',
  fails.length ? '## Gaps' : '## Gaps\n\nNone.',
  '',
  ...fails.flatMap((r) => [
    `### ${r.id}. ${r.q}`,
    `- expected: ${r.docs.join(', ')}`,
    `- routed: ${r.routed.join(', ') || 'none'}`,
    `- pass rate: ${r.passed}/${r.tries}`,
    `- loaded: ${loaded(r)}`,
    // The judge's lists are the doc-gap evidence: what the answer lacked and what it got wrong.
    `- judge (${dryRun ? 'mock, keyword rule' : judgeModel}): ${r.judge.verdict}${r.judge.missing.length ? ` | missing: ${r.judge.missing.join('; ')}` : ''}${r.judge.wrong.length ? ` | wrong: ${r.judge.wrong.join('; ')}` : ''}`,
    ...r.reasons.map((s) => `- ${s}`),
    '- fix: make the expected doc\'s first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.',
    '',
  ]),
  '## All questions',
  '',
  '| Q | Result | Pass rate | Routed to | Loaded |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.pass ? 'pass' : 'FAIL'} | ${r.passed}/${r.tries} | ${r.routed.join(', ')} | ${loaded(r)} |`),
  '',
].join('\n');
writeFileSync(out, md);
// One JSON line per question: what ran, what it scored, and what the JIT loader kept.
for (const r of rows) console.log(JSON.stringify({ id: r.id, runs: r.tries, passed: r.passed, pass: r.pass, judge: r.judge.verdict, docs_loaded_whole: r.whole, docs_loaded_sections: r.sections, loaded_bytes: r.bytes, citations_fixed: r.fixed }));
console.log(`score ${score}; judged by ${dryRun ? 'mock judge' : judgeModel}; report: ${out}`);
