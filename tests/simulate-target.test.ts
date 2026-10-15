import { describe, expect, it } from 'vitest';
import { simulateTarget } from '../scripts/simulate-target.ts';

describe('simulateTarget', () => {
  it('prefers an explicit --url', () => {
    expect(simulateTarget('http://10.0.0.5:6000', 'http://127.0.0.1:5434')).toEqual({
      url: 'http://10.0.0.5:6000',
      from: '--url',
    });
  });

  it('uses the library running now when no --url is given', () => {
    expect(simulateTarget(undefined, 'http://127.0.0.1:5434')).toEqual({
      url: 'http://127.0.0.1:5434',
      from: 'the library running now (recorded in your user folder)',
    });
  });

  it('falls back to the default port when nothing is running or recorded', () => {
    expect(simulateTarget(undefined, undefined)).toEqual({
      url: 'http://127.0.0.1:5317',
      from: 'default port, no running library recorded',
    });
  });
});
