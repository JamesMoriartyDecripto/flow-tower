#!/usr/bin/env node
// Run evals/questions.md through the answer flow and write the gap report.
// Usage: node eval.mjs [--dry-run] [--model <id>] [--out <gaps.md>] [--only Q3,Q7]
// A question fails on a wrong route, a missing key fact or a bad citation; --dry-run scores routing only.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { answer } from './answer.mjs';
import { DEFAULT_MODEL, EXAMPLE } from './lib.mjs';

const args = argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const dryRun = args.includes('--dry-run');
const model = flag('--model', DEFAULT_MODEL);
const out = flag('--out', join(EXAMPLE, 'gaps.md'));
const only = flag('--only', '')?.split(',').filter(Boolean);

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

const rows = [];
let cost = 0;
let tokens = 0;
for (const x of questions) {
  let res;
  try {
    res = await answer(x.q, { model, dryRun });
  } catch (e) {
    rows.push({ ...x, pass: false, reasons: [`error: ${e.message}`], routed: [] });
    console.log(`${x.id} ERROR ${e.message}`);
    continue;
  }
  const routed = res.stats.docs_loaded;
  const reasons = [];
  if (!routed.some((d) => x.docs.includes(d))) reasons.push(`wrong route: ${routed.join(', ')}`);
  if (!dryRun) {
    const lower = res.text.toLowerCase();
    const missing = x.facts.filter((f) => !f.split(' / ').some((alt) => lower.includes(alt.toLowerCase())));
    if (missing.length) reasons.push(`missing fact: ${missing.join('; ')}`);
    if (!res.guard?.ok) reasons.push(`bad citation: ${res.guard?.problems.join('; ')}`);
    cost += res.stats.cost;
    tokens += res.stats.tokens;
  }
  rows.push({ ...x, pass: !reasons.length, reasons, routed, ms: res.stats.ms, cites: res.guard?.cites ?? [] });
  console.log(`${x.id} ${reasons.length ? 'FAIL' : 'pass'}  ${routed.join(', ')}${reasons.length ? `  <- ${reasons.join(' / ')}` : ''}`);
}

const passed = rows.filter((r) => r.pass).length;
const fails = rows.filter((r) => !r.pass);
const score = `${passed}/${rows.length}`;
const md = [
  '# Doc gaps',
  '',
  `Latest run: ${new Date().toISOString().slice(0, 16)}Z, ${dryRun ? '**dry run: routing only** (keyword router, no model)' : `model \`${model}\``}.`,
  '',
  `**Score: ${score}** ${dryRun ? 'routed to an expected doc' : 'passed (route, facts and citations)'}.${dryRun ? '' : ` Tokens ${tokens}, cost $${cost.toFixed(4)}.`}`,
  '',
  fails.length ? '## Gaps' : '## Gaps\n\nNone.',
  '',
  ...fails.flatMap((r) => [
    `### ${r.id}. ${r.q}`,
    `- expected: ${r.docs.join(', ')}`,
    `- routed: ${r.routed.join(', ') || 'none'}`,
    ...r.reasons.map((s) => `- ${s}`),
    '- fix: make the expected doc\'s first lines or its CLAUDE.md row name this topic, or add the missing fact under one heading.',
    '',
  ]),
  '## All questions',
  '',
  '| Q | Result | Routed to |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.pass ? 'pass' : 'FAIL'} | ${r.routed.join(', ')} |`),
  '',
].join('\n');
writeFileSync(out, md);
console.log(`score ${score}; report: ${out}`);
