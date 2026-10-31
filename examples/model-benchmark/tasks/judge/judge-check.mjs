// Shared check for the judge tasks (#320 benchmark): keep or drop each real review finding. The answer key is what
// the lead decided on the day, after checking each finding in the code; `critical` findings must match exactly
// (a real security defect dropped, or a wrong finding kept, would have changed what was merged).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The answer is model output run as a module, and the task folder it may read holds the answer keys: a plan or a
// verdict is plain data, so any code that could reach other files or the process is refused before it is imported.
const CODE = /\b(import|require|process|globalThis|eval|Function|fetch|readFile|fs)\b/;
function plainData(answerPath) {
  const text = readFileSync(answerPath, 'utf8');
  // String contents are prose (a plan may say "import the helper"); only the code around them is checked.
  const body = text.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""').replace(/export\s+default/, '');
  assert.ok(!CODE.test(body), 'the answer must be plain data: no import, require, process, file or eval access');
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
