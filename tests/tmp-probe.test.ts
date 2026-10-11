import { describe, expect, it } from 'vitest';

/**
 * Placeholder that keeps the suite green while this probe file is removed: the probe (a Vite restart
 * experiment) is gone, and only its lesson survives as a comment in src/server/lifecycle.ts. This file
 * is intentionally empty of tests and can be deleted; it exists only because the toolchain used here
 * cannot remove files. Nothing in it runs.
 */
describe.skip('removed probe', () => {
  it('placeholder', () => { expect(true).toBe(true); });
});
