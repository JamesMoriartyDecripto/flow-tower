// The PR steward (#319): the lead used to check open pull requests by hand, pack, review and security at once, rerun a
// pass that answered empty or cut, then run the gate. This file holds the pure helpers of that flow, so each rule is
// tested without git, gh or a model. The command line at the bottom runs them for each pull request. Importing this
// file has no side effect. The steward never merges, approves, comments, pushes or marks a pull request ready.
import { execFile, execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, stderr, stdout } from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { parseVerdict } from './gate.mjs';
import { ledgerPath } from './ledger.mjs';

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

// Input is `git diff -z --name-status` text: NUL-separated tokens, a status then one path, or two paths for R and C.
// NUL is used because git quotes names with newlines or non-ASCII bytes in the line form, and a tab in a name would
// split it. A rename touches both paths, but only the new one still exists on disk, so `files` keeps the new side and
// drops deletions; a copy keeps the source too, since it is still there.
export function changedFiles(nameStatus) {
  const tokens = String(nameStatus ?? '').split('\0');
  const paths = [];
  const files = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (!status) continue;
    const n = /^[RC]/.test(status) ? 2 : 1;
    const ps = tokens.slice(i + 1, i + 1 + n);
    i += n;
    paths.push(...ps);
    if (status.startsWith('D')) continue;
    if (status.startsWith('C')) files.push(...ps);
    else files.push(ps[ps.length - 1]);
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

// ---- command line (#319-02) ----
// Every external call is an argv array with no shell, like gate.mjs. The gh and git calls that read a value from
// the PR (head sha, base name) are checked first, since those values go into git arguments.
const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: node tools/squad/prs.mjs [--pr 12,34] [--force] [--keep] [--dry-run] [--repo <path>]';
const SHA = /^[0-9a-f]{40}$/;
const BASE = /^[\w./-]+$/;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 50e6 });
const gh = (cwd, ...a) => execFileSync('gh', a, { cwd, encoding: 'utf8', maxBuffer: 50e6 });
const execFileP = promisify(execFile);

// Outputs and worktrees live in a folder next to the ledger, not in a shared temp folder: the output names come from
// public PR heads, and another user on the same machine could pre-place an approval in a shared folder and have the
// steward skip the review. The folder is created private (0700) when it is missing.
const stewardRoot = (env) => resolve(dirname(ledgerPath(env)), 'squad-prs');

// lstat rather than existsSync: a symlink, even a dangling one, at the worktree path counts as taken, so git cannot
// be led to write through it.
const taken = (p) => { try { lstatSync(p); return true; } catch { return false; } };

// Runs a child for its stdout and exit code. A failed run is a result, not a throw: the run's own failure words
// (empty answer, truncated answer) are read from its stdout.
const runAsync = (cmd, args, env) => execFileP(cmd, args, { encoding: 'utf8', maxBuffer: 50e6, env })
  .then((r) => ({ code: 0, stdout: r.stdout }), (e) => ({ code: typeof e.code === 'number' ? e.code : 1, stdout: String(e.stdout ?? '') }));

// A pass counts as done only when its saved answer parses as a verdict. A failed run still writes its stdout (for
// example "empty answer"), so a file's existence alone would cache the failure and never review that head again.
const parses = (file) => {
  try { parseVerdict(readFileSync(file, 'utf8')); return true; } catch { return false; }
};
const hasOut = (dir) => ['review.out', 'security.out'].every((n) => parses(join(dir, n)));

// The PR's facts, with its head and base checked before any git call uses them.
function view(repo, n) {
  const v = JSON.parse(gh(repo, 'pr', 'view', String(n), '--json', 'number,title,body,headRefOid,baseRefName'));
  if (!SHA.test(v.headRefOid)) throw new Error(`#${n}: head is not a commit sha`);
  if (!BASE.test(v.baseRefName) || v.baseRefName.startsWith('-')) throw new Error(`#${n}: base is not a branch name`);
  return v;
}

// Dry run: one line per PR, no fetch, no worktree, no model call.
function dryLine(root, v) {
  const dir = outputDir(root, v.number, v.headRefOid);
  const tag = linkedIssue(v.body) ?? v.number;
  return `#${v.number} ${v.headRefOid.slice(0, 7)} base origin/${v.baseRefName} tag #${tag} -> ${dir} (${hasOut(dir) ? 'cached' : 'new'})`;
}

// The brief is the PR title and body, plus the linked issue when the body names one.
function briefOf(repo, v) {
  let text = `Pull request #${v.number}: ${v.title}\n\n${v.body ?? ''}`.trim();
  const issue = linkedIssue(v.body);
  if (issue) {
    const i = JSON.parse(gh(repo, 'issue', 'view', String(issue), '--json', 'title,body'));
    text += `\n\n## Issue #${issue}: ${i.title}\n\n${i.body ?? ''}`;
  }
  return `${text}\n`;
}

// Runs one pass, moving to the next attempt only on an empty or a cut answer. The last stdout is the answer.
async function pass(role, models, task, tag, wt, env) {
  const outs = [];
  let last = { code: 1, stdout: '' };
  for (const model of attemptModels(role, models)) {
    last = await runAsync('node', [join(HERE, 'run.mjs'), '--model', model, '--role', role, '--node', `specialists.${role}`,
      '--task', task, '--issue', tag, '--repo', wt], env);
    outs.push(last.stdout);
    const o = passOutcome(last.code, last.stdout);
    if (o !== 'empty' && o !== 'truncated') break;
  }
  return outs;
}

// Packs both roles, then runs both passes at once. Returns the cost of every run's stdout, retries included.
async function runPasses(repo, config, v, wt, dir, tag) {
  const base = `origin/${v.baseRefName}`;
  const changed = changedFiles(git(wt, '-c', 'core.quotePath=false', 'diff', '-z', '--name-status', `${base}...HEAD`));
  // pack reads --paths and --files as comma lists, so a name with a comma would split into two wrong paths. Such a
  // file is left out of the task and named on its own line; the run goes on.
  const comma = (p) => p.includes(',');
  for (const p of changed.paths.filter(comma)) stdout.write(`#${v.number}: ${p} left out of the review task (comma in the name)\n`);
  const paths = changed.paths.filter((p) => !comma(p));
  const files = changed.files.filter((f) => !comma(f));
  const brief = join(dir, 'brief.md');
  writeFileSync(brief, briefOf(repo, v));
  // pack drops every full file when the task is over --max-kb, so one big file would cost both passes their context.
  // Only small files go in full; the big ones stay in the diff, since --paths carries every changed path.
  const FULL_MAX = 40_000;
  const small = files.filter((f) => statSync(join(wt, f)).size <= FULL_MAX);
  const roles = ['reviewer', 'security'];
  for (const role of roles) {
    const args = ['--role', role, '--issue', tag, '--repo', wt, '--base', base, '--brief', brief, '--max-kb', '200'];
    if (paths.length) args.push('--paths', paths.join(','));
    if (small.length) args.push('--files', small.join(','));
    writeFileSync(join(dir, `${role}.task.md`), execFileSync('node', [join(HERE, 'pack.mjs'), ...args], { encoding: 'utf8' }));
  }
  const env = { ...process.env, SQUAD_PACE: process.env.SQUAD_PACE ?? 'relaxed' };
  const [rev, sec] = await Promise.all(roles.map((role) =>
    pass(role, config.models, join(dir, `${role}.task.md`), tag, wt, env)));
  writeFileSync(join(dir, 'review.out'), rev.at(-1));
  writeFileSync(join(dir, 'security.out'), sec.at(-1));
  return [...rev, ...sec].reduce((sum, o) => sum + costOf(o), 0);
}

// One PR in turn: worktree, passes (unless cached), gate, then the worktree is removed unless --keep.
// Returns the table row and the gate's text, or null when the PR was skipped.
async function steward(repo, config, v, opts, root) {
  const n = v.number;
  const wt = join(root, `wt-pr-${n}`);
  if (taken(wt)) { stdout.write(`#${n}: ${wt} already exists, skipped\n`); return null; }
  git(repo, 'fetch', 'origin', `pull/${n}/head`);
  git(repo, 'fetch', 'origin', v.baseRefName);
  git(repo, 'worktree', 'add', '--detach', wt, v.headRefOid);
  // The worktree must not outlive the run: a throw in a pass or the gate would otherwise leave it behind, and the
  // next run would skip this PR as "already exists". The removal is in finally, so it runs on failure too.
  try {
    const dir = outputDir(root, n, v.headRefOid);
    mkdirSync(dir, { recursive: true });
    // A cached pass costs what its saved answers cost; a new pass is summed from its own runs.
    let cost;
    if (hasOut(dir) && !opts.force) {
      cost = costOf(readFileSync(join(dir, 'review.out'), 'utf8')) + costOf(readFileSync(join(dir, 'security.out'), 'utf8'));
    } else {
      cost = await runPasses(repo, config, v, wt, dir, linkedIssue(v.body) ?? n);
    }
    const g = await runAsync('node', [join(HERE, 'gate.mjs'), '--pr', String(n), '--review', join(dir, 'review.out'),
      '--security', join(dir, 'security.out'), '--repo', wt]);
    const ready = g.code === 0;
    const row = summaryRow({
      pr: n,
      head: v.headRefOid,
      review: verdictSummary(readFileSync(join(dir, 'review.out'), 'utf8')),
      security: verdictSummary(readFileSync(join(dir, 'security.out'), 'utf8')),
      gate: ready ? 'READY' : 'NOT READY',
      cost,
    });
    return { row, ready, gate: g.stdout };
  } finally {
    // A failed removal is reported, not thrown, so it cannot hide the run's own result or error.
    if (!opts.keep) {
      try { git(repo, 'worktree', 'remove', wt); } catch (e) { stdout.write(`could not remove ${wt}: ${e.message}\n`); }
    }
  }
}

// Returns the exit code: 0 when the steward ran (a NOT READY gate is a result, not an error), 2 for bad usage.
async function main() {
  const opts = parseArgs(argv.slice(2));
  if (!opts) { stderr.write(`${USAGE}\n`); return 2; }
  // The repo is the top of the work tree the --repo folder (or the current one) belongs to. Outside git, or for a
  // folder that does not exist, the run stops here with its own message.
  const cwd = opts.repo ? resolve(opts.repo) : process.cwd();
  let repo;
  try {
    repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    stderr.write(`${cwd} is not a git work tree\n`);
    return 2;
  }
  const root = stewardRoot(process.env);
  const config = loadConfig(repo);
  const numbers = opts.prs ?? JSON.parse(gh(repo, 'pr', 'list', '--state', 'open', '--json', 'number', '--limit', '50')).map((p) => p.number);
  const views = numbers.map((n) => view(repo, n));
  if (opts.dryRun) {
    for (const v of views) stdout.write(`${dryLine(root, v)}\n`);
    return 0;
  }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const rows = [];
  const blocks = [];
  for (const v of views) {
    try {
      const r = await steward(repo, config, v, opts, root);
      if (!r) continue;
      rows.push(r.row);
      if (!r.ready) blocks.push(`#${v.number}\n${r.gate}`);
    } catch (e) {
      stdout.write(`#${v.number}: ${e.message}\n`);
    }
  }
  stdout.write(['| PR | head | review | security | gate | cost |', '|---|---|---|---|---|---|', ...rows].join('\n') + '\n');
  for (const b of blocks) stdout.write(`\n${b}`);
  stdout.write(`outputs in ${root}\n`);
  return 0;
}

// Run directly, not imported: the realpath check means a symlinked path to this file still counts as the script.
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  main().then((code) => { process.exitCode = code; }, (e) => { stderr.write(`${e.message}\n`); process.exitCode = 1; });
}
