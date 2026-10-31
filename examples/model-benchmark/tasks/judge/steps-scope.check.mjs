// Deterministic check for steps-scope.md (#353, review round 1, reviewed commit a76aba3).
import { argv } from 'node:process';
import { checkJudge } from './judge-check.mjs';

await checkJudge(argv[2], {
  key: { R1: 'keep', R2: 'keep', S1: 'keep', S2: 'keep', S3: 'drop', S4: 'keep', S5: 'drop' },
  critical: ['S1', 'S2'],
  either: ['S5'],
  min: 5 / 6,
});
