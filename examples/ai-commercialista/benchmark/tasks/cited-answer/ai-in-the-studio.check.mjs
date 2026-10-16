// Task-specific rule for ai-in-the-studio.md: both disclosure and professional-control quotes must be
// present, and the answer must say the files give no fine. The fine is absent from the fixtures, so an
// invented amount is a failure, not a helpful answer.
import { argv } from 'node:process';
import { runCheck } from './verify-quotes.mjs';

runCheck(argv[2], (obj, quotes) => {
  if (!quotes.some((q) => q.includes('attività strumentali e di supporto'))) {
    return 'no quote with "attività strumentali e di supporto" (art. 13 c. 1)';
  }
  if (!quotes.some((q) => q.includes('comunicate al soggetto destinatario'))) {
    return 'no quote with "comunicate al soggetto destinatario" (art. 13 c. 2)';
  }
  if (!/not (in|stated|given|specified)|do(es)? not (say|state|set|specify)|no (fine|sanction|penalty) (is )?(stated|given|set)/i.test(obj.answer)) {
    return 'the answer does not say that the files give no fine';
  }
  return null;
});
