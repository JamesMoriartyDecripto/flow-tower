/** Types for scripts/squad-roles.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

export interface RoleCase {
  id: string;
  kind: string;
  head: string;
  keys: unknown[];
}

export interface RoleJob {
  model: string;
  role: string;
  case: { id: string };
  run: number;
}

export function planJobs(opts: { cases: { id: string }[]; roles: string[]; models: string[]; runs: number }): RoleJob[];

/** Scores a stored line again; the outcome and answer are kept, only the case key and score fields change. */
export function rescoreLine(
  line: Record<string, unknown>,
  kase: RoleCase,
  deps: { readFile: (path: string) => string | null; parseVerdict: unknown; checkFinding: unknown },
): Record<string, unknown>;
