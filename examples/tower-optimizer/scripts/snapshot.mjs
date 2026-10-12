#!/usr/bin/env node
// Phase 2 (inventory) and the "before" half of phase 6: freeze `flow-tower audit --json` into a file,
// so a later run can be compared with it (compare.mjs).
//   node scripts/snapshot.mjs <tower-or-dir> <out.json>
// FLOW_TOWER_BIN points at an installed `flow-tower` instead of the bin/flow-tower.js of this repo.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

/** The repo root is the nearest parent of this script that holds bin/flow-tower.js. */
function repoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'bin', 'flow-tower.js'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error('bin/flow-tower.js not found in any parent folder; set FLOW_TOWER_BIN');
    dir = up;
  }
}

/**
 * Runs the audit without a shell, so the path is passed as one argument and never interpreted.
 * The audit exits 1 when a tower has load errors but still prints its JSON: that output is kept,
 * because a snapshot of a broken tower is exactly what a before/after comparison needs.
 */
function runAudit(target) {
  const args = ['audit', target, '--json'];
  const bin = env.FLOW_TOWER_BIN;
  const [file, full] = bin
    ? [bin, args]
    : [process.execPath, [join(repoRoot(), 'bin', 'flow-tower.js'), ...args]];
  let stdout;
  try {
    stdout = execFileSync(file, full, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    if (err.status !== 1 || !err.stdout) throw new Error(`flow-tower audit failed: ${String(err.stderr || err.message).trim()}`);
    stdout = err.stdout;
  }
  return JSON.parse(stdout);
}

function main() {
  const [target, out] = argv.slice(2);
  if (!target || !out) {
    console.error('usage: snapshot.mjs <tower-or-dir> <out.json>');
    exit(2);
  }
  const path = resolve(target);
  const audit = runAudit(path);
  // takenAt and path come first so a reader sees when and what was measured before the towers.
  const snapshot = { takenAt: new Date().toISOString(), path, ...audit };
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`snapshot: ${audit.towers?.length ?? 0} tower(s) -> ${out}`);
}

main();
