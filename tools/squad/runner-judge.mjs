// The unattended lead's judge step (#320): numbers the reviewer's and the security auditor's findings, asks lead-judge
// to keep or drop each one with a reason, and turns the kept ones into one fix step. These are pure functions: the
// lead's command line does the model call and the file writes, so the same answers always give the same plan.

// Reviewer findings come first (R1, R2..), then security findings (S1..), each in the order the model gave them.
// The id and role are set after the spread, so a finding cannot pick its own id.
export function numberFindings(review, security) {
  const out = [];
  const add = (list, prefix, role) => {
    (Array.isArray(list?.findings) ? list.findings : []).forEach((f, i) => {
      out.push({ ...f, id: `${prefix}${i + 1}`, role });
    });
  };
  add(review, 'R', 'reviewer');
  add(security, 'S', 'security');
  return out;
}

// The keep/drop rule is spelled out in the prompt, because the judge must apply the same line to every finding: a
// pre-existing defect that this pull request neither introduces nor makes reachable is not the pull request's to fix.
export function judgePrompt(findings, brief) {
  const lines = findings.map((f) => {
    const tag = f.severity ? `${f.role}, ${f.severity}` : f.role;
    return `- **${f.id}** (${tag}) \`${f.file}\`: ${f.what} Why: ${f.why} Fix: ${f.fix}`;
  });
  const ids = findings.map((f) => `"${f.id}": {"decision": "keep" | "drop", "reason": "..."}`);
  return [
    String(brief ?? '').trim(),
    '',
    'Findings to judge:',
    ...lines,
    '',
    'Rule: keep: a real defect this pull request introduces, or makes reachable or worse even on a line it does not touch; drop: wrong, harmless, already handled, or a pre-existing defect this pull request does not affect.',
    '',
    'Answer only with a ```json block, with every id:',
    '```json',
    `{${ids.join(', ')}}`,
    '```',
  ].join('\n');
}

// The last ```json block is the answer; a reply with no fence is read as bare JSON. Never throws: a bad answer comes
// back as { ok: false, error } so the lead can ask again instead of crashing the run.
export function parseJudgement(text, ids) {
  const s = String(text ?? '');
  const fences = [...s.matchAll(/```json\s*([\s\S]*?)```/g)];
  const body = fences.length > 0 ? fences[fences.length - 1][1] : s;
  let raw;
  try { raw = JSON.parse(body); } catch { return { ok: false, error: 'answer is not JSON' }; }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'answer is not an object' };
  const keep = [];
  const drop = [];
  for (const id of ids) {
    const entry = raw[id];
    if (entry === null || typeof entry !== 'object') return { ok: false, error: `${id}: no decision` };
    if (entry.decision !== 'keep' && entry.decision !== 'drop') return { ok: false, error: `${id}: decision must be keep or drop` };
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (!reason) return { ok: false, error: `${id}: reason is empty` };
    if (entry.decision === 'keep') keep.push(id);
    else drop.push({ id, reason });
  }
  return { ok: true, keep, drop };
}

// A model-given path must stay inside the repository: absolute paths, '..' segments, backslashes and drive letters are
// refused, because the fix step would otherwise be told to edit files outside the worktree.
const insideRepo = (p) => p !== '' && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\') && !p.split('/').includes('..');

// The fix step sorts after the plan's steps (9<round>-...), and its Files line lists each file once, without the
// :line suffix, because steps.sh matches Files entries against paths. Findings outside the repository are left out;
// with none left, the result is null.
export function fixTask(allKept, { issue, round }) {
  const kept = allKept.filter((f) => insideRepo(String(f.file).replace(/:\d+(?:-\d+)?$/, '')));
  if (!kept.length) return null;
  const files = [...new Set(kept.map((f) => String(f.file).replace(/:\d+(?:-\d+)?$/, '')))];
  const items = kept.map((f, i) => `${i + 1}. ${f.file}: ${f.what} Fix: ${f.fix}`);
  const text = [
    `# ${issue}-9${round}: fix the kept review findings (round ${round})`,
    '',
    'Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines; never rewrite or empty an existing test file (add to the new one only).',
    'Verify: `run check`; `finish` with the output and a `Known gaps:` line.',
    '',
    'The review and the security pass found these defects in this pull request, and lead-judge kept each one. Fix each item and nothing else.',
    '',
    ...items,
    '',
    `Files: ${files.join(', ')}`,
    '',
  ].join('\n');
  return { name: `9${round}-review-fixes.md`, text };
}
