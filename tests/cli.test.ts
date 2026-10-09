import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (...args: string[]) => spawnSync(process.execPath, ['bin/flow-tower.js', ...args], { encoding: 'utf8' });

describe('cli validate', () => {
  it('passes on the examples and reports JSON', () => {
    const r = run('validate', 'examples/dev-squad', '--json');
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.projects).toEqual(['dev-squad.tower.yaml']);
  });

  it('fails with exit 1 on errors', () => {
    const r = run('validate', 'tests/fixtures/broken.tower.yaml');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('unknown agent "ghost"');
  });
});
