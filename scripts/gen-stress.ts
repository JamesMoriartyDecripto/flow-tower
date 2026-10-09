/** Generates synthetic towers for stress testing: node gen-stress.ts <layers> <nodesPerLayer> [outDir] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [layers = 12, perLayer = 10] = process.argv.slice(2, 4).map(Number);
const outDir = process.argv[4] ?? '.stress';
const TYPES = ['agent', 'process', 'decision', 'tool', 'model', 'memory', 'guard', 'hook', 'human', 'entry', 'output'];
const KINDS = ['flow', 'call', 'spawn', 'handoff', 'return', 'data'];
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const lines = [`version: 1`, `name: Stress ${layers}x${perLayer}`, `layers:`];
for (let l = 0; l < layers; l++) {
  lines.push(`  - id: l${l}`, `    title: Layer ${l + 1}`, `    nodes:`);
  for (let n = 0; n < perLayer; n++) lines.push(`      - { id: n${n}, type: ${pick(TYPES)}, label: "Node ${l}.${n}", model: claude-sonnet-5-5 }`);
  lines.push(`    edges:`);
  for (let n = 1; n < perLayer; n++) lines.push(`      - "n${Math.floor(rnd() * n)} -> n${n} [${pick(KINDS)}]${rnd() > 0.7 ? ': step' : ''}"`);
}
lines.push(`links:`);
for (let i = 0; i < layers * 3; i++) {
  const a = Math.floor(rnd() * layers);
  const b = Math.min(layers - 1, a + 1 + Math.floor(rnd() * 3));
  if (a !== b) lines.push(`  - "l${a}.n${Math.floor(rnd() * perLayer)} -> l${b}.n${Math.floor(rnd() * perLayer)} [${pick(KINDS)}]"`);
}

mkdirSync(outDir, { recursive: true });
const file = join(outDir, `stress-${layers}x${perLayer}.tower.yaml`);
writeFileSync(file, lines.join('\n') + '\n');
console.log(file);
