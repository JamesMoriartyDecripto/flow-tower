import { isAbsolute, relative, resolve } from 'node:path';

/**
 * True when `path` (absolute, or relative to `worktree`) resolves to a location strictly inside it.
 * Resolving first matters: a string prefix test accepts `<worktree>/../../etc/x.ts`.
 * Lives apart from hooks/index.ts so tests can load it without the Agent SDK.
 */
export function insideWorktree(worktree: string, path: string): boolean {
  const rel = relative(worktree, resolve(worktree, path));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
