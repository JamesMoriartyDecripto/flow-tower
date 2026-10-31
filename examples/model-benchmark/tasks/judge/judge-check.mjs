// Shared check for the judge tasks (#320 benchmark): keep or drop each real review finding. The answer key is what
// the lead decided on the day, after checking each finding in the code; `critical` findings must match exactly
// (a real security defect dropped, or a wrong finding kept, would have changed what was merged).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export async function checkJudge(answerPath, { key, critical, either = [], min = 0.75 }) {
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
