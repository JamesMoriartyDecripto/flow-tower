import { resolve } from 'node:path';

// Resolves a requested path under root and returns the absolute path, or throws.
export function resolveInside(root, requested) {
  const abs = resolve(root, requested);
  if (!abs.startsWith(root)) throw new Error('path escapes root');
  return abs;
}
