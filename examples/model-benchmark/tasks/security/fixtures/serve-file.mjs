// Serves files referenced by a tower to the local viewer. A tower may come from a cloned repository,
// so it must never read outside its project folder.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SECRET = /(^|\/)(\.git|\.ssh|node_modules)(\/|$)/;

export function isInside(projectRoot, requested) {
  const root = resolve(projectRoot);
  const abs = resolve(root, requested);
  return abs.startsWith(root) && !SECRET.test(abs);
}

export async function serveFile(projectRoot, requested, res) {
  if (!isInside(projectRoot, requested)) {
    res.writeHead(403).end('outside the project');
    return;
  }
  const text = await readFile(resolve(projectRoot, requested), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}
