/** Estimated narration length in seconds, at least 1.5. */
export function estimateSeconds(text: string): number;

export const WORDS_PER_SECOND: number;

/** Speech engine for Argo that returns silent WAV clips of the estimated length. */
export const silent: {
  describe(): { engine: string };
  generate(text: string): Promise<Buffer>;
};
