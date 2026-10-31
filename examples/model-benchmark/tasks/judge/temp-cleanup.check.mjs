// Deterministic check for temp-cleanup.md (#357, review rounds 1-2, diff at commit b9c6acb).
import { argv } from 'node:process';
import { checkJudge } from './judge-check.mjs';

await checkJudge(argv[2], {
  key: { S1: 'keep', S2: 'drop', S3: 'drop', S4: 'keep' },
  critical: ['S4'],
  either: ['S1'],
  min: 1,
});
