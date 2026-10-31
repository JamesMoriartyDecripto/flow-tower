// Deterministic check for quickfix-removal.md (#347, review round 1, reviewed commit 3b36cb6).
import { argv } from 'node:process';
import { checkJudge } from './judge-check.mjs';

await checkJudge(argv[2], {
  key: { R1: 'drop', R2: 'keep', S1: 'keep', S2: 'drop', S3: 'drop', S4: 'drop', S5: 'drop' },
  critical: ['S1'],
  min: 6 / 7,
});
