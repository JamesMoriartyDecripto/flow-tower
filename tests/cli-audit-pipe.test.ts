import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/**
 * #249: the audit JSON must survive a pipe. A pipe is drained asynchronously, so an exit() that runs
 * before the flush cut the output at 64 KB; the examples are big enough to show that cut.
 */
const ROOT = join(import.meta.dirname, '..');

it('writes the whole audit JSON into a pipe (#249)', { timeout: 120_000 }, () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'flow-tower.js'), 'audit', 'examples', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(r.stdout.length).toBeGreaterThan(65536);
  const audit = JSON.parse(r.stdout) as { towers: unknown[] };
  expect(audit.towers.length).toBeGreaterThan(20);
});
