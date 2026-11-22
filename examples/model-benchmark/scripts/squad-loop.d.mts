/** Types for scripts/squad-loop.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

export interface LoopJob {
  model: string;
  task: string;
  run: number;
}

export function planJobs(opts: { tasks: string[]; models: string[]; runs: number }): LoopJob[];
