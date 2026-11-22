/** Types for scripts/squad-loop.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

export function planJobs<T>(opts: { tasks: T[]; models: string[]; runs: number }): Array<{ model: string; task: T; run: number }>;
