// Shared check for the planner tasks taken from closed Flow Tower issues (#320 benchmark). A plan passes when it is
// well formed, its steps are small, and its Files: lines name every file the real fix had to touch. The real fix is
// the merged pull request; alternatives are listed where another file would have done the same job.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export async function checkPlan(answerPath, { must, maxSteps = 8, maxItems = 3 }) {
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
