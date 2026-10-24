// The merge gate's rules (#299): before a merge, the lead checks CI, the reviews and the findings. This file holds
// the rules as pure functions, so the same facts always give the same answer. The gate never merges or approves
// anything, and it uses no model: a finding counts only when its quote is really in the file.
// The command line at the bottom gathers the facts (git, gh, file reads) and passes them to those functions.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { realRelIfAllowed } from './guard.mjs';

// A run's output is a header line, the model's answer and a footer starting with "--- ". The JSON is cut out between
// the first '{' and the last '}', so a ```json fence or a prefix line does not break the parse.
export function parseVerdict(text) {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('no JSON verdict found');
  let raw;
  try { raw = JSON.parse(s.slice(start, end + 1)); } catch { throw new Error('no JSON verdict found'); }
  if (raw?.verdict !== 'approve' && raw?.verdict !== 'changes') throw new Error('verdict must be approve or changes');
  return { verdict: raw.verdict, findings: Array.isArray(raw.findings) ? raw.findings : [] };
}

// Model-derived text is printed into the gate's output, so it must not carry control characters: a newline or an
// ANSI escape in a file name could otherwise forge a READY line. Every control character becomes one space.
export function clean(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
}

// Whitespace is collapsed on both sides, so a quote that differs only in spacing still matches the file.
const norm = (s) => s.trim().replace(/\s+/g, ' ');

// A model often cites a line or two off, so the quote may sit within 3 lines of the cited one.
const WINDOW = 3;

// readFile(path) gives the file's text, or null when it is missing or not allowed. The check is not trusted to
// the model: a finding whose quote is not near its line is reported as unverified, with the reason.
export function checkFinding(finding, readFile) {
  const fail = (reason) => ({ ...finding, status: 'unverified', reason });
  const m = typeof finding?.file === 'string' ? finding.file.match(/^(.+):(\d+)(?:-\d+)?$/) : null;
  if (!m) return fail('bad file:line');
  const quote = typeof finding.quote === 'string' ? norm(finding.quote) : '';
  if (!quote) return fail('no quote');
  const text = readFile(m[1]);
  if (text === null || text === undefined) return fail('file not found');
  const lines = String(text).split('\n');
  const line = Number(m[2]);
  const from = Math.max(1, line - WINDOW);
  const to = Math.min(lines.length, line + WINDOW);
  const around = norm(lines.slice(from - 1, to).join(' '));
  // Models often copy the diff marker of a + or - line, so one leading marker may be dropped before the check.
  const bare = /^[+-]/.test(quote) ? norm(quote.slice(1)) : '';
  if (!around.includes(quote) && !(bare && around.includes(bare))) return fail('quote not at that line');
  return { ...finding, status: 'verified' };
}

const ROLES = ['reviewer', 'security'];
const PASSING = ['pass', 'skipping'];
const BLOCKING_SEVERITY = ['critical', 'high'];

// Returns the list of reasons the PR is not ready; it is ready only when that list is empty. Unverified findings are
// not reasons: they are listed for the lead to check by hand, since a wrong quote should not block a good change.
export function readiness(facts) {
  const reasons = [];
  const checks = Array.isArray(facts?.checks) ? facts.checks : [];
  if (checks.length === 0) reasons.push('no CI checks reported');
  for (const c of checks) {
    if (!PASSING.includes(c.bucket)) reasons.push(`CI ${c.name}: ${c.bucket}`);
  }
  const pr = facts.pr ?? {};
  if (pr.isDraft) reasons.push('the pull request is a draft');
  if (pr.mergeable !== 'MERGEABLE') reasons.push(`not mergeable: ${pr.mergeable}`);
  if (facts.localHead !== pr.headRefOid) reasons.push('the worktree is not at the pull request head');
  const verdicts = Array.isArray(facts.verdicts) ? facts.verdicts : [];
  for (const role of ROLES) {
    if (!verdicts.some((v) => v.role === role)) reasons.push(`${role}: no verdict`);
  }
  for (const v of verdicts) {
    if (v.verdict === 'changes') reasons.push(`${v.role}: changes requested`);
    if (v.at < facts.lastCommitAt) reasons.push(`${v.role}: older than the last commit, run it again`);
    for (const f of v.findings ?? []) {
      if (f.status === 'verified' && BLOCKING_SEVERITY.includes(f.severity)) {
        reasons.push(`${v.role}: ${clean(f.severity)} finding at ${clean(f.file)}`);
      }
    }
  }
  return { ready: reasons.length === 0, reasons };
}

// ---- command line (#299-04) ----
// Only reads: gh pr checks, gh pr view and git rev-parse. It never runs gh pr merge or gh pr review, so a run cannot
// change the PR; the lead does that by hand once the gate says READY.
const USAGE = 'usage: node tools/squad/gate.mjs --pr <n> --review <file> --security <file> [--repo <path>]';
// The same secret rule as pack.mjs: a finding may not make the gate read an env file, a key or git internals.
const SECRET = /(^|\/)(\.env[^/]*|.*\.(key|pem|p12|pfx|crt)|id_rsa[^/]*|\.npmrc|\.git|node_modules|\.ssh|\.config\/flow-tower)(\/|$)/i;
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : undefined; };
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// gh pr checks exits non-zero when a check fails or is pending, but it still prints the JSON on stdout: read that.
// Anything else that cannot be read counts as no checks, which the readiness rules then refuse.
function ciChecks(n, repo) {
  let out;
  try { out = run('gh', ['pr', 'checks', n, '--json', 'name,bucket'], repo); } catch (e) { out = e.stdout; }
  try {
    const list = JSON.parse(String(out ?? ''));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// A file is read only when its real path (symlinks followed) stays inside the repo and is not secret (guard.mjs).
// The file is read at its resolved path, not the path it was named by, so a symlink swapped in after the check
// cannot redirect the read. Each path is read at most once per run: many findings often cite the same file.
const readInRepo = (repo) => {
  const cache = new Map();
  return (p) => {
    if (cache.has(p)) return cache.get(p);
    let text = null;
    try {
      const abs = resolve(repo, p);
      const rel = relative(repo, abs);
      if (rel && !rel.startsWith('..') && !SECRET.test(rel)) {
        const real = realRelIfAllowed({ repo, abs, secret: SECRET, writable: /^/ });
        if (real !== null) text = readFileSync(resolve(realpathSync(repo), real), 'utf8');
      }
    } catch { text = null; }
    cache.set(p, text);
    return text;
  };
};

// Throws when the file holds no usable verdict; the caller turns that into a reason.
function verdictOf(role, file, readFile) {
  const parsed = parseVerdict(readFileSync(file, 'utf8'));
  return {
    role,
    verdict: parsed.verdict,
    at: statSync(file).mtimeMs,
    findings: parsed.findings.map((f) => checkFinding(f, readFile)),
  };
}

// Returns the exit code: 0 ready, 1 not ready, 2 bad usage.
function main() {
  if (argv.includes('--help')) { stdout.write(`${USAGE}\n`); return 0; }
  const n = arg('pr');
  const review = arg('review');
  const security = arg('security');
  // The PR number goes into the gh call: digits only, so nothing else can ride along.
  if (!/^\d+$/.test(String(n ?? '')) || !review || !security || !existsSync(review) || !existsSync(security)) {
    stderr.write(`${USAGE}\n`);
    return 2;
  }
  const repo = resolve(arg('repo') ?? run('git', ['rev-parse', '--show-toplevel'], process.cwd()).trim());
  const head = run('git', ['rev-parse', 'HEAD'], repo).trim();
  const view = JSON.parse(run('gh', ['pr', 'view', n, '--json', 'mergeable,isDraft,headRefOid,commits'], repo));
  const commits = Array.isArray(view.commits) ? view.commits : [];
  const committed = Date.parse(commits.at(-1)?.committedDate);

  const readFile = readInRepo(repo);
  const verdicts = [];
  const errors = [];
  for (const [role, file] of [['reviewer', review], ['security', security]]) {
    try { verdicts.push(verdictOf(role, file, readFile)); } catch (e) { errors.push(`${role}: ${clean(e.message)}`); }
  }
  const result = readiness({
    checks: ciChecks(n, repo),
    pr: { mergeable: view.mergeable, isDraft: view.isDraft, headRefOid: view.headRefOid },
    localHead: head,
    lastCommitAt: Number.isNaN(committed) ? 0 : committed,
    verdicts,
  });
  const reasons = [...errors, ...result.reasons];
  const lines = [result.ready && reasons.length === 0 ? `READY: #${n} can be merged` : `NOT READY: #${n}`];
  for (const r of reasons) lines.push(`- ${r}`);
  const unverified = verdicts.flatMap((v) => v.findings
    .filter((f) => f.status === 'unverified')
    .map((f) => `- ${v.role} ${clean(f.file)}: ${clean(f.reason)}`));
  if (unverified.length > 0) lines.push('Unverified findings (check them in the code before acting):', ...unverified);
  stdout.write(`${lines.join('\n')}\n`);
  return reasons.length === 0 ? 0 : 1;
}

// Run directly, not imported: the realpath check means a symlinked path to this file still counts as the script.
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  try { process.exitCode = main(); } catch (e) { stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
