import { mkdirSync, mkdtempSync, existsSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { env } from 'node:process';
import { describe, expect, it } from 'vitest';
import globalTmp from './global-tmp';

describe('per-run temp folder (#357)', () => {
  it('routes tmpdir() into a flow-tower-tests- folder', () => {
    expect(basename(tmpdir())).toMatch(/^flow-tower-tests-/);
    const made = mkdtempSync(join(tmpdir(), 'x-'));
    expect(dirname(made)).toBe(tmpdir());
    rmSync(made, { recursive: true, force: true });
  });

  it('removes old leftovers, keeps new ones, and tears down its own folder', () => {
    const savedTmpdir = env.TMPDIR;
    const fakeBase = mkdtempSync(join(tmpdir(), 'fake-base-'));
    try {
      env.TMPDIR = fakeBase;
      const old = join(fakeBase, 'flow-tower-tests-old');
      const fresh = join(fakeBase, 'flow-tower-tests-new');
      mkdirSync(old);
      mkdirSync(fresh);
      const twoDaysAgo = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
      utimesSync(old, twoDaysAgo, twoDaysAgo);

      const teardown = globalTmp();
      expect(existsSync(old)).toBe(false);
      expect(existsSync(fresh)).toBe(true);

      const runDir = env.TMPDIR;
      expect(dirname(runDir)).toBe(fakeBase);
      expect(basename(runDir)).toMatch(/^flow-tower-tests-/);
      expect(existsSync(runDir)).toBe(true);

      teardown();
      expect(existsSync(runDir)).toBe(false);
      expect(env.TMPDIR).toBe(fakeBase);
    } finally {
      if (savedTmpdir === undefined) delete env.TMPDIR;
      else env.TMPDIR = savedTmpdir;
      rmSync(fakeBase, { recursive: true, force: true });
    }
  });
});
