// Deterministic check for temp-cleanup.md. Real fix: PR #358 (#357).
import { argv } from 'node:process';
import { checkPlan } from './plan-check.mjs';

await checkPlan(argv[2], {
  must: [
    // Test temp folders: one place for the whole run (the real fix: a vitest globalSetup) or a shared helper.
    ['vitest.config.ts', /^tests\/(helpers\/)?[^/]*(tmp|temp|setup)[^/]*\.ts$/i],
    ['tools/squad/steps.sh'],
    // Log pruning lives in the runner or in a new runner file.
    ['tools/squad/run.mjs', /^tools\/squad\/[^/]*(log|prune)[^/]*\.mjs$/i],
  ],
});
