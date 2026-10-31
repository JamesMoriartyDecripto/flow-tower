// Shared check for the judge tasks (#320 benchmark): keep or drop each real review finding. The answer key is what
// the lead decided on the day, after checking each finding in the code; `critical` findings must match exactly
// (a real security defect dropped, or a wrong finding kept, would have changed what was merged).
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

export async function checkJudge(answerPath, { key, critical, either = [], min = 0.75 }) {
  plainData(answerPath);
  const got = (await import(pathToFileURL(answerPath).href)).default;
  assert.ok(got && typeof got === 'object', 'export default must be an object of id -> "keep" | "drop"');
  const ids = Object.keys(key);
  for (const id of ids) assert.ok(got[id] === 'keep' || got[id] === 'drop', `${id}: "keep" or "drop", got ${JSON.stringify(got[id])}`);
  for (const id of critical) assert.equal(got[id], key[id], `${id} must be ${key[id]}`);
  // `either` findings are contested on review (both answers defensible): answered, but not scored.
  const scored = ids.filter((id) => !either.includes(id));
  const right = scored.filter((id) => got[id] === key[id]).length;
  assert.ok(right / scored.length >= min, `${right}/${scored.length} decisions match, need ${Math.ceil(min * scored.length)}`);
}
