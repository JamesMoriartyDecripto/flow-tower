// Write guard for run.mjs (#169 review): a path inside the repo can still be a symlink that leads out of it.
// Writes follow symlinks, so the real path of the target (or of its nearest existing parent, for a new file)
// must sit inside the real repo and inside a writable folder, else the write is refused.
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

// Real path of `abs`: the nearest existing ancestor is resolved, the missing tail is added back as is.
// A dangling symlink has an lstat entry but no real path, so realpathSync throws and the write is refused.
export function realTarget(abs) {
  const tail = [];
  let p = abs;
  while (!lstatSync(p, { throwIfNoEntry: false })) {
    const up = dirname(p);
    if (up === p) break;
    tail.unshift(basename(p));
    p = up;
  }
  return join(realpathSync(p), ...tail);
}

// Returns the repo-relative real path when it is allowed, else null. `secret` and `writable` are regexes.
export function realRelIfAllowed({ repo, abs, secret, writable }) {
  const rel = relative(realpathSync(repo), realTarget(abs));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  if (secret.test(rel) || !writable.test(rel)) return null;
  return rel;
}
