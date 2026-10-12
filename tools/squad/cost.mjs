#!/usr/bin/env node
// node tools/squad/cost.mjs <issue> [--json]: one issue's squad cost from the local ledger (#156).
// The Markdown block is meant to be pasted on the issue when it closes, so the numbers can be audited later.
import { ledgerPath, readRuns, summarize } from './ledger.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const issue = args.find((a) => !a.startsWith('--'));

if (!issue) {
  console.error('usage: node tools/squad/cost.mjs <issue> [--json]');
  process.exit(1);
}

const summary = summarize(readRuns(ledgerPath(process.env)), issue);

if (json) {
  console.log(JSON.stringify({ issue, ...summary }, null, 2));
  process.exit(0);
}

if (summary.total.runs === 0) {
  console.log(`No squad runs recorded for #${issue}.`);
  process.exit(0);
}

// Cache is shown as a share of prompt tokens; with no prompt tokens there is nothing to divide by, so 0%.
const pct = (row) => (row.promptTokens > 0 ? `${Math.round((row.cachedTokens / row.promptTokens) * 100)}%` : '0%');
const lines = [
  `**Squad cost for #${issue}:** $${summary.total.cost.toFixed(4)} over ${summary.total.runs} runs, ${summary.total.steps} steps.`,
  '',
  '| Role | Model | Runs | Steps | Cost | Cache |',
  '|---|---|---|---|---|---|',
  ...summary.rows.map((r) => `| ${r.role} | ${r.model} | ${r.runs} | ${r.steps} | $${r.cost.toFixed(4)} | ${pct(r)} |`),
];
console.log(lines.join('\n'));
