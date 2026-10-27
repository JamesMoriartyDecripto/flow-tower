/** Types for tools/squad/mode.mjs: the module stays plain JS, and this is what its TypeScript test sees. */

export type SquadMode = 'loop' | 'oneshot' | 'batch';

export function pickMode(opts: {
  role: string;
  flags: { oneshot: boolean; batch: boolean; loop: boolean };
  pace: string | undefined;
}): { mode: SquadMode; why?: 'flag' | 'pace' | 'default' };
