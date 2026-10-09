/**
 * Static demo build (GitHub Pages): the app plus a frozen copy of what the dev server would serve.
 *   node --experimental-strip-types scripts/build-demo.ts [entries...] [--out dist-demo]
 * Writes data/workspace.json and one JSON per referenced file (same sandbox rules as /api/file),
 * then runs `vite build --mode demo` with a relative base, so the site works under any path.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import { loadLibrary } from '../src/core/loader.ts';
import { readTowerFile } from '../src/server/files.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'dist-demo' } } });
const out = resolve(values.out);
const entries = positionals.length ? positionals : ['examples'];

rmSync(out, { recursive: true, force: true });
await build({ mode: 'demo', base: './', logLevel: 'warn', build: { outDir: out, emptyOutDir: true } });

const { workspace, roots } = await loadLibrary(entries);
// Paths on the build machine mean nothing in a browser: keep the issue text, drop absolute prefixes.
const cwd = process.cwd();
const scrub = (s: string) => s.split(cwd + '/').join('').split(cwd).join('.');
for (const t of Object.values(workspace.towers)) for (const i of t.issues) i.message = scrub(i.message);

const data = join(out, 'data');
mkdirSync(join(data, 'files'), { recursive: true });
writeFileSync(join(data, 'workspace.json'), JSON.stringify(workspace));

// files/index.json maps "tower\npath" to a numbered file, so odd characters in paths never reach a URL.
const index: Record<string, number> = {};
let n = 0;
let skipped = 0;
for (const [id, tower] of Object.entries(workspace.towers)) {
  const root = roots.get(id);
  if (!root) continue;
  const paths = new Set<string>();
  for (const node of tower.layers.flatMap((l) => l.nodes)) {
    node.files.forEach((f) => paths.add(f));
    node.agent?.files.forEach((f) => paths.add(f));
    node.resources.forEach((r) => r.path && paths.add(r.path));
  }
  for (const path of paths) {
    const { status, body } = await readTowerFile(root, path);
    if (status !== 200) { skipped++; continue; }
    index[`${id}\n${path}`] = n;
    writeFileSync(join(data, 'files', `${n++}.json`), JSON.stringify(body));
  }
}
writeFileSync(join(data, 'files', 'index.json'), JSON.stringify(index));
console.log(`demo: ${workspace.projects.length} projects, ${Object.keys(workspace.towers).length} towers, ${n} files (${skipped} not previewable) → ${out}`);
