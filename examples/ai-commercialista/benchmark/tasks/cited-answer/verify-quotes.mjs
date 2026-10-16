// Shared by the cited-answer checks (Node ESM, no dependencies). The answer must be one JSON object whose
// quotes are copied from the two fixtures: a paraphrase that sounds right is still a failure, since the
// professional must be able to find the words in the law.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = ['fixtures/l212-2000-art10bis.txt', 'fixtures/l132-2025-art13.txt'];
// Whitespace runs collapse on both sides: a line break in the source must not fail a quote copied on one line.
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

// Answers come wrapped in a fence or in prose: take the fenced block first, else the outermost braces.
function extractObject(text) {
  const fenced = /```json\n([\s\S]*?)```/.exec(text)?.[1];
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  const candidates = [fenced, start >= 0 && end > start ? text.slice(start, end + 1) : null];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const v = JSON.parse(c);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* try the next candidate */ }
  }
  return null;
}

// Shared rules first, then the task's own rule (returns an error message, or null). Exit 1 names one reason.
export function runCheck(answerPath, taskRule) {
  const fail = (why) => { console.error(`FAIL: ${why}`); process.exit(1); };
  if (!answerPath) fail('usage: <check>.mjs <answer file>');
  const obj = extractObject(readFileSync(answerPath, 'utf8'));
  if (!obj) fail('no JSON object in the answer');
  if (typeof obj.answer !== 'string' || !obj.answer.trim()) fail('answer is missing');
  const cites = Array.isArray(obj.citations) ? obj.citations : [];
  if (!cites.length) fail('citations is empty');
  for (const c of cites) {
    if (!FIXTURES.includes(c?.file)) fail(`file is not one of the two fixtures: ${c?.file}`);
    if (typeof c.quote !== 'string' || c.quote.length < 20) fail(`quote under 20 characters: ${JSON.stringify(c.quote)}`);
    const source = collapse(readFileSync(join(here, c.file), 'utf8'));
    if (!source.includes(collapse(c.quote))) fail(`quote not found verbatim in ${c.file}: ${JSON.stringify(c.quote.slice(0, 80))}`);
  }
  const reason = taskRule(obj, cites.map((c) => collapse(c.quote)));
  if (reason) fail(reason);
  console.log('PASS');
}
