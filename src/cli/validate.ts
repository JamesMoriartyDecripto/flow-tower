/**
 * `flow-tower validate <files|dirs> [--json]`: loads towers exactly like the app and reports issues.
 * Exit code 1 when any error is found (warnings and infos do not fail).
 */
import { argv, exit } from 'node:process';
import { loadLibrary } from '../core/loader.ts';

const args = argv.slice(2);
const json = args.includes('--json');
const entries = args.filter((a) => a !== '--json');
if (!entries.length) {
  console.error('usage: flow-tower validate <file.tower.yaml | dir>... [--json]');
  exit(2);
}

const { workspace } = await loadLibrary(entries);
const towers = Object.values(workspace.towers).map((t) => ({
  id: t.id,
  name: t.name,
  layers: t.layers.length,
  nodes: t.layers.reduce((a, l) => a + l.nodes.length, 0),
  links: t.links.length,
  issues: t.issues,
}));
const errors = towers.reduce((a, t) => a + t.issues.filter((i) => i.level === 'error').length, 0);

if (json) {
  console.log(JSON.stringify({ ok: errors === 0, projects: workspace.projects, towers }, null, 2));
} else if (!towers.length) {
  console.log('no *.tower.yaml found');
} else {
  for (const t of towers) {
    const counts = ['error', 'warning', 'info'].map((l) => `${t.issues.filter((i) => i.level === l).length} ${l}`).join(', ');
    console.log(`${t.issues.some((i) => i.level === 'error') ? '✗' : '✓'} ${t.id} — ${t.layers} layers, ${t.nodes} nodes, ${t.links} links (${counts})`);
    for (const i of t.issues) console.log(`    ${i.level.padEnd(7)} ${i.path ? `${i.path}: ` : ''}${i.message}`);
  }
}
exit(errors ? 1 : 0);
