// Deterministic check for steps-scope.md. Real fix: PR #354 (#353).
import assert from 'node:assert/strict';
import { argv } from 'node:process';
import { checkPlan } from './plan-check.mjs';

const { files, added } = await checkPlan(argv[2], {
  must: [
    ['tools/squad/steps.sh'],
    // Any test file: the real fix added tests/squad-step-scope.test.ts and extended tests/squad-scripts.test.ts.
    [/^tests\/.+\.test\.ts$/],
  ],
});
// A new runner file must join RUNNER_FILES, or squad doctor reports a partial install. The real fix added one and
// its first run went red on exactly this; a plan that keeps the logic in steps.sh needs no such entry.
if ([...added].some((f) => /^tools\/squad\/[^/]+\.mjs$/.test(f))) {
  assert.ok(files.has('src/cli/squad-local.ts'), 'a new tools/squad/*.mjs needs src/cli/squad-local.ts (RUNNER_FILES)');
}
