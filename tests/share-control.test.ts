import { describe, expect, it } from 'vitest';
import { shareMode, shareOf, shareStatus, type TowerShare } from '../src/app/sharing.ts';

const NOW = Date.parse('2026-05-01T12:00:00Z');

const base: TowerShare = { name: 'alpha', dir: '/work/alpha', files: false, projects: ['alpha'] };

describe('shareOf (#266)', () => {
  it('finds the share whose folder holds the project', () => {
    const shares = [base, { ...base, name: 'beta', dir: '/work/beta', projects: ['beta', 'beta-sub'] }];
    expect(shareOf(shares, 'beta-sub')?.name).toBe('beta');
  });

  it('returns undefined for a project in no shared folder', () => {
    expect(shareOf([base], 'gamma')).toBeUndefined();
    expect(shareOf([], 'alpha')).toBeUndefined();
  });
});

describe('shareMode (#266)', () => {
  it('is off without a share, towers for YAML only, files when referenced files are sent', () => {
    expect(shareMode(undefined)).toBe('off');
    expect(shareMode(base)).toBe('towers');
    expect(shareMode({ ...base, files: true })).toBe('files');
  });
});

describe('shareStatus (#266)', () => {
  it('reads on the hub with the time of the last sync', () => {
    const s = shareStatus({ ...base, syncedAt: NOW - 2 * 60_000 }, NOW);
    expect(s).toEqual({ text: 'on the hub · 2 min ago', tone: 'on', title: 'alpha is on the hub' });
  });

  it('reads not sent with the error as the title', () => {
    const s = shareStatus({ ...base, syncedAt: NOW - 60_000, error: 'the hub refused' }, NOW);
    expect(s).toEqual({ text: 'not sent', tone: 'err', title: 'the hub refused' });
  });

  it('reads sending while there is neither a sync nor an error yet', () => {
    const s = shareStatus(base, NOW);
    expect(s.text).toBe('sending…');
    expect(s.tone).toBe('dim');
  });
});
