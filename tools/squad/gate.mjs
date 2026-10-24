// The merge gate's rules (#299): before a merge, the lead checks CI, the reviews and the findings. This file holds
// only those rules as pure functions, so the same facts always give the same answer. The gate never merges or
// approves anything, and it uses no model: a finding counts only when its quote is really in the file.
// The command line that gathers the facts (git, gh, file reads) lives in its own step and passes them in here.

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
  if (!around.includes(quote)) return fail('quote not at that line');
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
        reasons.push(`${v.role}: ${f.severity} finding at ${f.file}`);
      }
    }
  }
  return { ready: reasons.length === 0, reasons };
}
