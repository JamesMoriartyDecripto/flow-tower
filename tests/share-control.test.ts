import { describe, expect, it } from 'vitest';
import { darkProjects, satTitle, shareMode, shareOf, shareStatus, type SharingState, type TowerShare } from '../src/app/sharing.ts';

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

describe('darkProjects (#266)', () => {
  const WINDOW = 60_000;
  const node = (lastTs: number) => ({ lastTs });
  const projects = [
    { id: 'alpha', towers: new Set(['alpha']) },
    { id: 'beta', towers: new Set(['beta', 'beta-sub']) },
    { id: 'gamma', towers: new Set(['gamma']) },
  ];

  it('lists an active project that no share lists', () => {
    const nodes = new Map([['alpha#main.a', node(NOW - 1000)]]);
    expect(darkProjects(nodes, projects, [], NOW, WINDOW)).toEqual(['alpha']);
  });

  it('does not list an active project that a share lists', () => {
    const nodes = new Map([['alpha#main.a', node(NOW - 1000)]]);
    expect(darkProjects(nodes, projects, [{ projects: ['alpha'] }], NOW, WINDOW)).toEqual([]);
  });

  it('does not list a project idle past the window', () => {
    const nodes = new Map([['gamma#main.a', node(NOW - WINDOW - 1)]]);
    expect(darkProjects(nodes, projects, [], NOW, WINDOW)).toEqual([]);
  });

  it('counts activity in a sub-tower for its project, in the given order', () => {
    const nodes = new Map([
      ['beta-sub#main.a', node(NOW)],
      ['alpha#main.b', node(NOW)],
    ]);
    expect(darkProjects(nodes, projects, [], NOW, WINDOW)).toEqual(['alpha', 'beta']);
  });
});

describe('satTitle dark projects (#266)', () => {
  const online: SharingState = { state: 'online', hub: 'https://hub.example/' };

  it('keeps the plain title when no project is dark', () => {
    expect(satTitle(online)).toBe(satTitle(online, []));
  });

  it('names the dark projects on an online or queued chip', () => {
    const title = satTitle(online, ['alpha', 'beta']);
    expect(title).toContain('Active here but dark on the hub (not shared): alpha, beta.');
    expect(satTitle({ ...online, state: 'queued', queued: 2 }, ['alpha'])).toContain('dark on the hub (not shared): alpha.');
  });

  it('does not name them when the relay is paused or revoked', () => {
    expect(satTitle({ state: 'paused' }, ['alpha'])).not.toContain('dark');
    expect(satTitle({ state: 'revoked' }, ['alpha'])).not.toContain('dark');
  });
});
