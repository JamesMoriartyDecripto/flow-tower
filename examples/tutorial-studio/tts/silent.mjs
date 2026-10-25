// A speech engine that makes no sound. The silent dry run uses it so every action
// runs with clips of the length the outline budgets, before any voice is paid for.

import { silence } from './wav.mjs';

// 150 words a minute, the outline's time budget.
export const WORDS_PER_SECOND = 2.5;

// Shorter clips would leave no time for the scene's mark to register on screen.
const MIN_SECONDS = 1.5;

/** Estimated narration length: the words in the text at the budgeted pace. */
export function estimateSeconds(text) {
  // Split on any whitespace run; the filter drops the empty strings at the ends.
  const words = String(text).split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_SECONDS, words / WORDS_PER_SECOND);
}

export const silent = {
  describe: () => ({ engine: 'silent' }),
  async generate(text) {
    return silence(estimateSeconds(text));
  },
};
