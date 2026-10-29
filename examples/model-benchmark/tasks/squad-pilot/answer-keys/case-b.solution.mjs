// Reference solution for case B. Never sent to a model: only the offline check runs it.
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveInside(root, requested) {
  const base = resolve(root);
  const abs = resolve(base, requested);
  // relative() compares path segments, so /srv/files-private is not inside /srv/files.
  const rel = relative(base, abs);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('path escapes root');
  return abs;
}
