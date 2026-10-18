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
  // The files give no fine, so any wording of "none" passes and any amount in a fine sentence is invented.
  // Matching fixed phrases missed valid answers such as "Neither file sets a fine", so sentences are judged.
  const sentences = String(obj.answer).split(/[.;!?](?=\s|$)/);
  const fineSentences = sentences.filter((s) => /\b(fine|fines|penalt|sanction)/i.test(s));
  if (fineSentences.some((s) => /(€|eur\b|euro)\s*\d|\d[\d.,]*\s*(€|eur\b|euro)/i.test(s))) {
    return 'the answer states a fine amount the files do not give';
  }
  if (!fineSentences.some((s) => /\b(no|not|neither|nor|none|without)\b|n't\b/i.test(s))) {
    return 'the answer does not say that the files give no fine';
  }
  return null;
});
