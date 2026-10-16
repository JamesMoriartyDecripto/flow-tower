// Task-specific rule for cpb-choice.md: the answer must quote comma 4 and name it, so a model that
// answers from memory (comma 3 or 10-bis in general) fails even when its prose sounds right.
import { argv } from 'node:process';
import { runCheck } from './verify-quotes.mjs';

runCheck(argv[2], (obj, quotes) => {
  if (!quotes.some((q) => q.includes('libertà di scelta del contribuente tra regimi opzionali'))) {
    return 'no quote from comma 4 (libertà di scelta del contribuente tra regimi opzionali)';
  }
  if (!/comma\s*4|c\.\s*4|paragraph\s*4/i.test(obj.answer)) return 'the answer does not name comma 4';
  return null;
});
