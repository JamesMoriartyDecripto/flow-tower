// The squad's role registry (#334). Each role names its canonical node in examples/dev-squad/dev-squad.tower.yaml,
// whether it writes (and where), whether its answer is the JSON verdict the merge gate reads (gate.mjs), and which
// configured model family it falls back to when squad.json names no model for it. Only reviewer and security are
// gated on a verdict; the other roles answer in the format their task asks for.
// Pure, so the rules are tested without spawning run.mjs. A role that is not in ROLES is refused before any request.

import { writeDirs } from './args.mjs';

// `family` names the models.<key> entry a role uses when squad.json has none for it. It is a fallback, not a
// benchmark claim: read-only graders share the reviewer's model, the rest share the coder's.
export const ROLES = {
  triage: { node: 'intake.triage', writes: 'none', verdict: false, family: 'coder', rule: 'Read-only: classify from the task; change nothing.' },
  architect: { node: 'orchestration.architect', writes: 'none', verdict: false, family: 'reviewer', rule: 'Read-only: produce the plan the task asks for; change nothing.' },
  researcher: { node: 'specialists.researcher', writes: 'none', verdict: false, family: 'reviewer', rule: 'Read-only: gather and cite evidence; change nothing.' },
  // The coder writes the folders the config or --write names.
  coder: { node: 'specialists.coder', writes: 'task', verdict: false, family: 'coder', rule: 'You may write only the folders the task names; run the checks before you finish.' },
  // The tester runs the existing check commands (check, typecheck, test) through the guarded run tool; it writes nothing.
  tester: { node: 'specialists.tester', writes: 'none', verdict: false, family: 'coder', rule: 'Read-only: run the existing checks and report the results; write no files.' },
  reviewer: { node: 'quality.reviewer', writes: 'none', verdict: true, family: 'reviewer', rule: 'Read-only: judge the code in the task; change nothing.' },
  security: { node: 'quality.security', writes: 'none', verdict: true, family: 'security', rule: 'Read-only: audit for security defects; change nothing.' },
  verifier: { node: 'quality.verifier', writes: 'none', verdict: false, family: 'reviewer', rule: 'Read-only: check the branch against the criteria; change nothing.' },
  // The doc writer never inherits src/ or tests/: it writes only the folders given with --write.
  'doc-writer': { node: 'specialists.doc_writer', writes: 'explicit', verdict: false, family: 'coder', rule: 'You may write only the doc folders named with --write; touch no code.' },
};

export const isRole = (role) => typeof role === 'string' && Object.hasOwn(ROLES, role);
export const canWrite = (role) => isRole(role) && ROLES[role].writes !== 'none';
export const needsVerdict = (role) => isRole(role) && ROLES[role].verdict;
export const roleRule = (role) => (isRole(role) ? ROLES[role].rule : '');

// The loop's finish instruction: the gate's roles answer with the JSON verdict only; the rest keep the free report.
export function finishRule(role) {
  return needsVerdict(role)
    ? 'When done, call finish with only the JSON verdict the task asks for, then a `Known gaps:` line (or `Known gaps: none`).'
    : 'When done, call finish with your report, and end that report with a `Known gaps:` line (or `Known gaps: none`).';
}

// The folders a role may write, as the --write argument spells them. A doc writer with no --write gets null: it refuses
// to run, rather than inherit the coder's folders. Other roles keep the config's folders, which also scope their diff.
export function writeArgFor(role, writeArg, configWrite) {
  if (role === 'doc-writer') return writeArg ?? null;
  return writeArg ?? configWrite.join(',');
}

// The write folders a run starts with: null when the role's --write is refused (no --write for a doc writer, or a bad dir).
// run.mjs checks this before it reads the key, so a usage error is never hidden behind a missing key.
export function startupWrite(role, writeArg, configWrite) {
  const folders = writeArgFor(role, writeArg, configWrite);
  return folders === null ? null : writeDirs(folders);
}
