// Deterministic check for focus-links.md. Real fix: PR #361 (#360).
import { argv } from 'node:process';
import { checkPlan } from './plan-check.mjs';

await checkPlan(argv[2], {
  maxSteps: 4,
  must: [
    // The rule lives in the pure helper; changing only Links.tsx would also hide the links.
    ['src/app/scene/linkFocus.ts', 'src/app/scene/Links.tsx'],
    ['tests/link-focus.test.ts'],
  ],
});
