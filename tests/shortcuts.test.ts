import { beforeAll, describe, expect, it, vi } from 'vitest';

let GROUPS: typeof import('../src/app/hud/Shortcuts').GROUPS;
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  ({ GROUPS } = await import('../src/app/hud/Shortcuts'));
});

/** Every key label in the reference, flattened. */
const rows = () => GROUPS.flatMap(([, keys]) => keys);

describe('keyboard reference (? overlay)', () => {
  // A feature that is reachable but undocumented is invisible to keyboard users; Sharing is
  // reachable through Settings or the SAT chip, so that path must be listed here.
  it('documents how to reach the Sharing settings', () => {
    expect(rows().find(([, what]) => what.includes('Sharing'))).toBeDefined();
  });

  it('uses each key label only once, so two rows cannot claim the same key', () => {
    const labels = rows().map(([k]) => k);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
