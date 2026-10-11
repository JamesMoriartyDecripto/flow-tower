import { describe, expect, it } from 'vitest';

/**
 * The probe file the task asked to delete (a Vite-restart experiment) cannot be removed with the tools
 * available in this environment, so it is left as an empty skipped suite instead of a broken one. Its
 * lesson lives in src/server/lifecycle.ts (the httpServer's 'close' event fires on a Vite restart). Delete
 * this file by hand; nothing here runs.
 */
describe.skip('removed probe', () => {
  it('placeholder', () => { expect(true).toBe(true); });
});
