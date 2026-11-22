// Scores one squad review run against its case key (#447). The rules are the gate's own: parseVerdict and checkFinding
// are passed in, so this file imports nothing from tools/squad and reads no file itself. A defect run counts when its
// verdict asks for changes and a finding lands on a key; a clean run passes only on approve with no blocking finding.
// The gate blocks on everything except medium and low, so a missing or unknown severity blocks too.
// The report uses the same rule, so a verdict and its severity count agree.
export function isBlocking(severity) {
  return !['medium', 'low'].includes(severity);
}

// A finding's file is "path:line" or "path:line-line"; a key names the path alone.
const stripLine = (file) => String(file ?? '').replace(/:\d+(?:-\d+)?$/, '');
const text = (f) => [f.what, f.why, f.fix, f.quote].map((x) => String(x ?? '')).join(' ');

// Null values are skipped, as a run without a timing or a price has nothing to add to the middle.
const median = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export function scoreRun({ kase, outcome, answer, readFile, parseVerdict, checkFinding }) {
  const none = { verdict: null, flagged: false, keys: [], keysBlocking: [], blocking: 0, findings: 0, verified: 0 };
  // A run that did not finish has no verdict to score: its outcome is the failure, whatever the answer holds.
  if (outcome !== 'finish') return { pass: false, ...none, failure: outcome };
  let parsed;
  try {
    parsed = parseVerdict(answer);
  } catch {
    return { pass: false, ...none, failure: 'no-verdict' };
  }
  const { verdict, findings } = parsed;
  // keysBlocking is the same match over the blocking findings only: what the gate would have stopped.
  const matchedKeys = (fs) =>
    kase.keys
      .filter((k) => {
        const re = new RegExp(k.pattern, 'i');
        return fs.some((f) => stripLine(f.file) === k.file && re.test(text(f)));
      })
      .map((k) => k.id);
  // Computed once: the gate's blocking rule decides both keysBlocking and the blocking count.
  const blockingFindings = findings.filter((f) => isBlocking(f.severity));
  const keys = matchedKeys(findings);
  const keysBlocking = matchedKeys(blockingFindings);
  const verified = findings.filter((f) => checkFinding(f, readFile).status === 'verified').length;
  const blocking = blockingFindings.length;
  const flagged = verdict === 'changes';
  const pass = kase.kind === 'defect' ? flagged && keys.length > 0 : verdict === 'approve' && blocking === 0;
  return { pass, verdict, flagged, keys, keysBlocking, blocking, findings: findings.length, verified, failure: null };
}

// Rows per role and model. The sort puts the best pass count first, then the cheapest run.
export function summarize(lines) {
  const groups = new Map();
  for (const l of lines) {
    const key = JSON.stringify([l.role, l.model]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const rows = [...groups.values()].map((ls) => {
    const defects = ls.filter((l) => l.kind === 'defect');
    const cleans = ls.filter((l) => l.kind === 'clean');
    const pass = ls.filter((l) => l.pass).length;
    const failures = {};
    for (const l of ls) if (l.failure) failures[l.failure] = (failures[l.failure] ?? 0) + 1;
    const cost = ls.reduce((s, l) => s + (l.cost ?? 0), 0);
    return {
      role: ls[0].role,
      model: ls[0].model,
      runs: ls.length,
      pass,
      defectRuns: defects.length,
      caught: defects.filter((l) => l.pass).length,
      flaggedDefects: defects.filter((l) => l.flagged).length,
      cleanRuns: cleans.length,
      cleanPass: cleans.filter((l) => l.pass).length,
      seen: defects.filter((l) => l.keys.length > 0).length,
      blocked: defects.filter((l) => l.keysBlocking.length > 0).length,
      cleanOpen: cleans.filter((l) => !l.failure && l.blocking === 0).length,
      failures,
      findings: ls.reduce((s, l) => s + l.findings, 0),
      verified: ls.reduce((s, l) => s + l.verified, 0),
      medianSeconds: median(ls.map((l) => l.seconds)),
      cost,
      costPerPass: pass ? cost / pass : null,
    };
  });
  return rows.sort((a, b) => a.role.localeCompare(b.role) || b.pass - a.pass || a.cost - b.cost);
}

// One Markdown table per role. Money has 4 decimals: a run costs fractions of a cent, so 2 would read as zero.
const usd = (x) => `$${x.toFixed(4)}`;
const frac = (a, b) => `${a}/${b}`;
export function table(rows) {
  const head = ['Model', 'Pass', 'Defects caught', 'Flagged', 'Clean approved', 'Key seen', 'Key blocked', 'Clean not blocked', 'Failed runs', 'Verified findings', 'Median s', '$/run', '$/pass'];
  const out = [];
  for (const role of [...new Set(rows.map((r) => r.role))]) {
    out.push(`## ${role}`, '', `| ${head.join(' | ')} |`, `|${'---|'.repeat(head.length)}`);
    for (const r of rows.filter((x) => x.role === role)) {
      const failed = Object.entries(r.failures).map(([name, n]) => `${n} ${name}`).join(', ') || '0';
      const cells = [
        `\`${r.model}\``,
        frac(r.pass, r.runs),
        frac(r.caught, r.defectRuns),
        frac(r.flaggedDefects, r.defectRuns),
        frac(r.cleanPass, r.cleanRuns),
        frac(r.seen, r.defectRuns),
        frac(r.blocked, r.defectRuns),
        frac(r.cleanOpen, r.cleanRuns),
        failed,
        frac(r.verified, r.findings),
        r.medianSeconds == null ? '-' : r.medianSeconds.toFixed(1),
        usd(r.cost / r.runs),
        r.costPerPass == null ? '-' : usd(r.costPerPass),
      ];
      out.push(`| ${cells.join(' | ')} |`);
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}
