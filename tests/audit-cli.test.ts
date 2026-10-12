import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanEnv } from './fixtures/clean-env';

/**
 * `flow-tower audit` (#173-03): the CLI prints advice and never fails on findings. The example tower is
 * read from the checkout; nothing is written.
 */
const CLI = join(import.meta.dirname, '..', 'bin', 'flow-tower.js');
const EXAMPLE = join(import.meta.dirname, '..', 'examples', 'dev-squad');

/** Async: a synchronous child would block this process; the timeout kills a stuck child so close fires. */
function audit(args: string[]) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [CLI, 'audit', ...args], { timeout: 20_000, env: cleanEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('flow-tower audit (#173-03)', () => {
  it('prints the audit as JSON with inventory, findings and model fit', { timeout: 30_000 }, async () => {
    const r = await audit([EXAMPLE, '--json']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { towers: Record<string, unknown>[] };
    expect(out.towers.length).toBeGreaterThan(0);
    const dev = out.towers.find((t) => t.id === 'dev-squad.tower.yaml') ?? out.towers[0];
    expect(dev).toHaveProperty('inventory');
    expect(dev).toHaveProperty('findings');
    expect(dev).toHaveProperty('modelFit');
    expect(Array.isArray(dev.findings)).toBe(true);
    expect(Array.isArray(dev.modelFit)).toBe(true);
    const fits = dev.modelFit as { node: string; role: string }[];
    expect(fits.find((f) => f.node === 'quality.reviewer')?.role).toBe('review');
  });

  it('prints a header line per tower in text mode', { timeout: 30_000 }, async () => {
    const r = await audit([EXAMPLE]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^[✓✗] \S+ — .+: \d+ layers, \d+ nodes/m);
    expect(r.stdout).toContain('model fit:');
  });

  it('exits 2 with usage when no entry is given', { timeout: 15_000 }, async () => {
    const r = await audit([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: flow-tower audit');
  });
});
