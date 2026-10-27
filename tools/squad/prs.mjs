// The PR steward (#319): the lead used to check open pull requests by hand, pack, review and security at once, rerun a
// pass that answered empty or cut, then run the gate. This file holds the pure helpers of that flow, so each rule is
// tested without git, gh or a model. The command line comes in a later step; importing this file has no side effect.
import { join } from 'node:path';
import { parseVerdict } from './gate.mjs';

const FLAGS = new Set(['--force', '--keep', '--dry-run']);

// Returns the options, or null for a bad --pr value, an unknown flag or a stray word. --pr takes digits only, comma
// separated, because its numbers go into gh calls and file names: nothing else may ride along.
export function parseArgs(argv) {
  const opts = { prs: null, force: false, keep: false, dryRun: false, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') {
      const v = argv[++i];
      if (!/^\d+(,\d+)*$/.test(String(v ?? ''))) return null;
      opts.prs = v.split(',').map(Number);
    } else if (a === '--repo') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return null;
      opts.repo = v;
    } else if (FLAGS.has(a)) {
      opts[a === '--dry-run' ? 'dryRun' : a.slice(2)] = true;
    } else {
      return null;
    }
  }
  return opts;
}

// GitHub links an issue with these words; the first link in the body is the issue the PR closes.
const LINK = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/i;

export function linkedIssue(body) {
  const m = String(body ?? '').match(LINK);
  return m ? Number(m[1]) : null;
}

// The run prints its own failure words (see run.mjs): an empty or a cut answer is retried, anything else is an error.
export function passOutcome(code, stdout) {
  if (code === 0) return 'ok';
  const s = String(stdout ?? '');
  if (s.includes('empty answer')) return 'empty';
  if (s.includes('truncated answer')) return 'truncated';
  return 'error';
}

// The reviewer gets a second try on an empty or cut answer. The security pass also gets a second try on its own
// model, then falls back to the reviewer model, since a second security failure means the brief, not luck, is the
// problem (README § Pace). The CLI decides when to move on; this only lists the attempts in order.
export function attemptModels(role, models) {
  if (role === 'security') return [models.security, models.security, models.reviewer];
  return [models.reviewer, models.reviewer];
}

// The run footer carries "· $0.0123 ·" per step. Summing every footer gives what the pass cost, retries included.
export function costOf(stdout) {
  let sum = 0;
  for (const m of String(stdout ?? '').matchAll(/· \$(\d+(?:\.\d+)?) ·/g)) sum += Number(m[1]);
  return sum;
}

// Input is `git diff --name-status` text: "M\tpath", "D\tpath" or "R100\told\tnew". A rename touches both paths, but
// only the new one still exists on disk, so `files` keeps the new side and drops deletions.
export function changedFiles(nameStatus) {
  const paths = [];
  const files = [];
  for (const line of String(nameStatus ?? '').split('\n')) {
    if (!line) continue;
    const [status, ...rest] = line.split('\t');
    const existing = rest[rest.length - 1];
    paths.push(...rest);
    if (!status.startsWith('D')) files.push(existing);
  }
  return { paths, files };
}

// One folder per PR and head commit, so a rerun on a new head never reuses an older pack.
export function outputDir(base, pr, sha) {
  return join(base, `pr-${pr}-${sha.slice(0, 12)}`);
}

export function summaryRow({ pr, head, review, security, gate, cost }) {
  return `| #${pr} | ${String(head).slice(0, 7)} | ${review} | ${security} | ${gate} | $${Number(cost).toFixed(4)} |`;
}

// Known severities are counted in this order; anything else, or no severity at all, is counted as other.
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// Short text for the summary table, e.g. "changes: 1 high, 2 low". A text that is not a verdict says "no verdict".
export function verdictSummary(text) {
  let parsed;
  try { parsed = parseVerdict(text); } catch { return 'no verdict'; }
  const counts = new Map();
  for (const f of parsed.findings) {
    const sev = SEVERITIES.includes(f?.severity) ? f.severity : 'other';
    counts.set(sev, (counts.get(sev) ?? 0) + 1);
  }
  const parts = [...SEVERITIES, 'other']
    .filter((s) => counts.get(s))
    .map((s) => `${counts.get(s)} ${s}`);
  return parts.length ? `${parsed.verdict}: ${parts.join(', ')}` : parsed.verdict;
}
