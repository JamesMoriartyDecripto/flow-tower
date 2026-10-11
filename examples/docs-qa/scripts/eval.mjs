#!/usr/bin/env node
// Run evals/questions.md through the answer flow and write the gap report.
// Usage: node eval.mjs [--dry-run] [--model <id>] [--out <gaps.md>] [--only Q3,Q7] [--runs N] [--whole-bytes <n>]
// A question fails on a wrong route, a missing key fact or a bad citation. --dry-run runs the same pipeline
// offline against a mock writer (see answer.mjs): the scores are a smoke test, not a model score.
// Each question runs N times (default 3) and passes on the majority: the same docs scored 15/24 then 11/24 live.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { answer } from './answer.mjs';
import { DEFAULT_MODEL, EXAMPLE, LOAD_WHOLE_BYTES } from './lib.mjs';

const args = argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const dryRun = args.includes('--dry-run');
const model = flag('--model', DEFAULT_MODEL);
const out = flag('--out', join(EXAMPLE, 'gaps.md'));
const only = flag('--only', '')?.split(',').filter(Boolean);
const wholeBytes = Number(flag('--whole-bytes')) || LOAD_WHOLE_BYTES;
// The dry run is deterministic, so one pass is enough; live runs repeat to average out model noise.
const runs = dryRun ? 1 : Math.max(1, Number(flag('--runs', '3')) || 3);

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

/** One pass: route, then score facts and citations. Returns the reasons it failed (empty = pass). */
async function attempt(x) {
  try {
    const res = await answer(x.q, { model, dryRun, wholeBytes });
    const reasons = [];
    if (!res.stats.docs_loaded.some((d) => x.docs.includes(d))) reasons.push(`wrong route: ${res.stats.docs_loaded.join(', ')}`);
    // Facts and citations count in a dry run too: the mock writer answers nothing useful, but the
    // guard and the scorer must be exercised offline, or a broken guard call ships unnoticed.
    const lower = res.text.toLowerCase();
    const missing = x.facts.filter((f) => !f.split(' / ').some((alt) => lower.includes(alt.toLowerCase())));
    if (missing.length) reasons.push(`missing fact: ${missing.join('; ')}`);
    if (!res.guard?.ok) reasons.push(`bad citation: ${res.guard?.problems.join('; ')}`);
    return { pass: !reasons.length, reasons, routed: res.stats.docs_loaded, whole: res.stats.loaded_whole ?? [], sections: res.stats.loaded_sections ?? [], bytes: res.stats.loaded_bytes ?? 0, tokens: res.stats.tokens, cost: res.stats.cost, ms: res.stats.ms, cites: res.guard?.cites ?? [] };
  } catch (e) {
    return { pass: false, reasons: [`error: ${e.message}`], routed: [], whole: [], sections: [], bytes: 0, tokens: 0, cost: 0, ms: 0, cites: [] };
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
  const row = { ...x, tries: runs, passed, pass: passed * 2 > runs, reasons: fail?.reasons ?? [], routed: fail?.routed ?? last.routed, whole: last.whole, sections: last.sections, bytes: last.bytes, cites: last.cites };
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
  `Latest run: ${new Date().toISOString().slice(0, 16)}Z, ${dryRun ? '**dry run: mock model, keyword router, one pass** (routing, JIT loading, citations and scoring; no real answers)' : `model \`${model}\`, ${runs} runs per question (majority pass)`}, docs loaded whole up to ${wholeBytes} B.`,
  '',
  `**Score: ${score}** ${dryRun ? 'passed with a mock model; nothing was answered, so this is a pipeline smoke test, not a quality score' : 'passed the majority (route, facts and citations)'}.${dryRun ? '' : ` Tokens ${tokens}, cost $${cost.toFixed(4)}.`}`,
  '',
  fails.length ? '## Gaps' : '## Gaps\n\nNone.',
  '',
  ...fails.flatMap((r) => [
    `### ${r.id}. ${r.q}`,
    `- expected: ${r.docs.join(', ')}`,
    `- routed: ${r.routed.join(', ') || 'none'}`,
    `- pass rate: ${r.passed}/${r.tries}`,
    `- loaded: ${loaded(r)}`,
    ...r.reasons.map((s) => `- ${s}`),
    '- fix: make the expected doc\'s first lines or its CLAUDE.md row name this topic, or add the missing fact under one heading.',
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
for (const r of rows) console.log(JSON.stringify({ id: r.id, runs: r.tries, passed: r.passed, pass: r.pass, docs_loaded_whole: r.whole, docs_loaded_sections: r.sections, loaded_bytes: r.bytes }));
console.log(`score ${score}; report: ${out}`);
