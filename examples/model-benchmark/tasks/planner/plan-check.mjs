// Shared check for the planner tasks taken from closed Flow Tower issues (#320 benchmark). A plan passes when it is
// well formed, its steps are small, and its Files: lines name every file the real fix had to touch. The real fix is
// the merged pull request; alternatives are listed where another file would have done the same job.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The answer is model output run as a module, and the task folder it may read holds the answer keys. A plan or a
// verdict is plain data, so outside its strings only data syntax is allowed (an allowlist: a denylist of names was
// bypassed in review with constructor chains). Without parentheses, dots, backticks or bare names nothing can run.
// The same check lives in plan-check.mjs and judge-check.mjs: a task may read only its own folder.
// The code of the answer with every '...' and "..." string emptied and comments dropped, scanned one character at a
// time so a quote or a backtick inside a string is text. A backtick outside a string starts a template literal, which could hide code in
// ${...}: plain data never needs one, so it is refused.
function codeOutsideStrings(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '`') throw new assert.AssertionError({ message: 'the answer must be plain data: no template literals' });
    // Comments are dropped (an apostrophe in one must not open a string); any other slash would be a regex or a division,
    // which plain data never has, and a regex could hold a quote that throws the scan off.
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; continue; }
    if (c === '/') throw new assert.AssertionError({ message: 'the answer must be plain data: no regex or division' });
    if (c !== "'" && c !== '"') { out += c; continue; }
    out += '""';
    for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
  }
  return out;
}

function plainData(answerPath) {
  const code = codeOutsideStrings(readFileSync(answerPath, 'utf8')).replace(/^\s*export\s+default\b/, '');
  // Numbers first (their dot and sign are the only ones allowed), then names: a key before a colon, or a literal.
  const rest = code.replace(/-?\d+(\.\d+)?/g, '0').replace(/[A-Za-z_$][\w$]*(?=\s*:)|\b(true|false|null)\b/g, '');
  assert.ok(/^[\s{}[\]:,;"0]*$/.test(rest), 'the answer must be plain data: an object literal of strings, numbers, arrays and objects');
}

export async function checkPlan(answerPath, { must, maxSteps = 8, maxItems = 3 }) {
  plainData(answerPath);
  const plan = (await import(pathToFileURL(answerPath).href)).default;
  assert.ok(plan && typeof plan === 'object', 'export default must be an object');
  assert.ok(Array.isArray(plan.criteria) && plan.criteria.length > 0, 'criteria: a nonempty array');
  assert.ok(Array.isArray(plan.steps) && plan.steps.length > 0, 'steps: a nonempty array');
  assert.ok(plan.steps.length <= maxSteps, `at most ${maxSteps} steps, got ${plan.steps.length}`);
  const files = new Set();
  const added = new Set();
  for (const [i, s] of plan.steps.entries()) {
    assert.ok(Array.isArray(s.items) && s.items.length > 0 && s.items.length <= maxItems, `step ${i + 1}: 1-${maxItems} items`);
    assert.ok(Array.isArray(s.files) && s.files.length > 0, `step ${i + 1}: a nonempty files list`);
    for (const f of s.files) {
      const path = String(f).replace(/\+$/, '').trim();
      files.add(path);
      if (String(f).trim().endsWith('+')) added.add(path);
    }
  }
  const all = [...files];
  for (const group of must) {
    // A group is met when any listed path is named, or a pattern (a RegExp) matches a named path.
    const met = group.some((g) => (g instanceof RegExp ? all.some((f) => g.test(f)) : files.has(g)));
    assert.ok(met, `files miss one of: ${group.map(String).join(' | ')}`);
  }
  return { files, added };
}
