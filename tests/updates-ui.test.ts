import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The Settings › Updates status line (#141): one line that must name the right reason, in priority order.
 * The helpers are pure and live next to the section; the section's own imports touch `location`, so the
 * module is loaded after stubbing the browser globals it reads at import time.
 */
let statusOf: typeof import('../src/app/hud/Updates')['statusOf'];
let vtag: typeof import('../src/app/hud/Updates')['vtag'];

beforeAll(async () => {
  vi.stubGlobal('location', { search: '' });
  const mod = await import('../src/app/hud/Updates');
  ({ statusOf, vtag } = mod);
});

describe('update status line (#141)', () => {
  it('normalizes a tag that may or may not carry the leading v', () => {
    expect(vtag('1.2.3')).toBe('v1.2.3');
    expect(vtag('v1.2.3')).toBe('v1.2.3');
  });

  it('says Checking while a forced check runs', () => {
    expect(statusOf(undefined, true, false)).toBe('Checking…');
    expect(statusOf({ current: '1.0.0', newer: false }, true, false)).toBe('Checking…');
  });

  it('appends the throttle notice when the answer replayed the last check', () => {
    expect(statusOf({ current: '1.0.0', latest: 'v1.2.0', newer: true }, false, true)).toBe('v1.2.0 available (checked less than a minute ago)');
  });

  it('names each failure the user can act on', () => {
    const base = { current: '1.0.0', newer: false };
    expect(statusOf({ ...base, error: 'offline' }, false, false)).toBe('Could not reach GitHub');
    expect(statusOf({ ...base, error: 'unavailable' }, false, false)).toBe('GitHub did not answer (try again later)');
    expect(statusOf({ ...base, disabled: true }, false, false)).toBe('Update check is off (FLOW_TOWER_NO_UPDATE_CHECK)');
  });

  it('says which release is available, else Up to date', () => {
    expect(statusOf({ current: '1.0.0', latest: 'v1.2.0', newer: true }, false, false)).toBe('v1.2.0 available');
    // A newer flag with no latest (a stale cache) cannot name a release: stay honest.
    expect(statusOf({ current: '1.0.0', newer: true }, false, false)).toBe('Up to date');
    expect(statusOf({ current: '1.0.0', latest: 'v1.0.0', newer: false }, false, false)).toBe('Up to date');
  });
});
