#!/usr/bin/env node
// node tools/squad/cost.mjs <issue> [--repo <path>] [--all] [--json]: one issue's squad cost from the local ledger (#156).
// The ledger is shared by every project (#265), so by default only the project of --repo (default: the git root
// of the cwd) is summed; --all sums every project. The Markdown block is meant to be pasted on the issue when it
// closes, so the numbers can be audited later.
import { execFileSync } from 'node:child_process';
import { ledgerPath, projectOf, readRuns, summarize } from './ledger.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const all = args.includes('--all');
// --repo takes a value: that value is not the issue number.
const repoAt = args.indexOf('--repo');
const repoValueAt = repoAt >= 0 ? repoAt + 1 : -1;
const repoArg = repoAt >= 0 ? args[repoValueAt] : undefined;
const issue = args.find((a, i) => !a.startsWith('--') && i !== repoValueAt);

if (!issue) {
  console.error('usage: node tools/squad/cost.mjs <issue> [--repo <path>] [--all] [--json]');
  process.exit(1);
}

let repo = repoArg;
if (!repo) {
  try {
    repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    repo = process.cwd();
  }
}
const project = projectOf(repo);
// Entries written before #265 have no project. Every one of them was a run of this repo, so they count for flow-tower only.
const LEGACY_PROJECT = 'flow-tower';
const runs = readRuns(ledgerPath(process.env)).filter((r) => all || (r.project ?? LEGACY_PROJECT) === project);
const summary = summarize(runs, issue);

if (json) {
  console.log(JSON.stringify({ issue, project: all ? 'all' : project, ...summary }, null, 2));
  process.exit(0);
}

if (summary.total.runs === 0) {
  console.log(`No squad runs recorded for #${issue}.`);
  process.exit(0);
}

// Cache is shown as a share of prompt tokens; with no prompt tokens there is nothing to divide by, so 0%.
const pct = (row) => (row.promptTokens > 0 ? `${Math.round((row.cachedTokens / row.promptTokens) * 100)}%` : '0%');
// Runs with an unknown cost are left out of the money total and said so, so the number is not taken as complete.
const unknown = summary.total.unknownCost > 0 ? ` (${summary.total.unknownCost} with unknown cost, not counted)` : '';
const lines = [
  `**Squad cost for #${issue}:** $${summary.total.cost.toFixed(4)}${unknown} over ${summary.total.runs} ${summary.total.runs === 1 ? 'run' : 'runs'}, ${summary.total.steps} ${summary.total.steps === 1 ? 'step' : 'steps'}.`,
  '',
  '| Role | Model | Runs | Steps | Cost | Cache |',
  '|---|---|---|---|---|---|',
  ...summary.rows.map((r) => `| ${r.role} | ${r.model} | ${r.runs} | ${r.steps} | $${r.cost.toFixed(4)}${r.unknownCost ? ` + ${r.unknownCost} unknown` : ''} | ${pct(r)} |`),
];
console.log(lines.join('\n'));
