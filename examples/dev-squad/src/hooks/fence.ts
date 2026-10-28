import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * Lexical test: `path` resolves strictly inside `worktree` without following any link.
 * Only `..` as a whole segment is an escape: a name such as `..fixtures.ts` is in-tree.
 */
function lexicalInside(worktree: string, path: string): boolean {
  const rel = relative(worktree, resolve(worktree, path));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** True when `path` is a directory entry (a symlink, dangling or not) whose realpath failed. */
function existsAsLink(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Real path of the deepest existing ancestor of `path`, with the missing tail joined back.
 * A write to `src/new/b.ts` must be checked where it will land, even though `src/new` does not exist yet.
 */
function realTarget(path: string): string {
  const tail: string[] = [];
  let probe = path;
  for (;;) {
    try {
      return join(realpathSync(probe), ...tail);
    } catch (err) {
      // A dangling link exists as a name but its target does not: walking up would join the link
      // back as a plain new file and the write would follow it. Refuse instead.
      if (existsAsLink(probe)) throw err;
      const parent = dirname(probe);
      if (parent === probe) throw err;
      tail.unshift(basename(probe));
      probe = parent;
    }
  }
}

/**
 * True when `path` (absolute, or relative to `worktree`) resolves to a location strictly inside it.
 * Resolving first matters: a string prefix test accepts `<worktree>/../../etc/x.ts`.
 * The lexical test alone is not enough: a symlink such as `src/link -> /etc` passes it while the kernel
 * follows it on write, so the real paths of the worktree and of the target must also be inside.
 * A worktree that does not exist gives false (fail closed).
 * A raw `..` segment is refused before any resolution: the kernel resolves `..` after following links,
 * so `src/link/../x.ts` (link -> /etc) looks inside once normalized but writes outside. No write needs `..`.
 * Lives apart from hooks/index.ts so tests can load it without the Agent SDK.
 */
export function insideWorktree(worktree: string, path: string): boolean {
  if (path.split(/[\\/]/).includes('..')) return false;
  if (!lexicalInside(worktree, path)) return false;
  try {
    const root = realpathSync(worktree);
    return lexicalInside(root, realTarget(resolve(worktree, path)));
  } catch {
    return false;
  }
}
