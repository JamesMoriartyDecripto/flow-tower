import { isAbsolute, relative, resolve, sep } from 'node:path';

// Clean fixture for case B: a segment-aware, lexical guard that the tests accept.
export function resolveInside(root, requested) {
  const base = resolve(root);
  const abs = resolve(base, requested);
  // relative() compares path segments, so /srv/files-private is not inside /srv/files.
  const rel = relative(base, abs);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('path escapes root');
  return abs;
}
