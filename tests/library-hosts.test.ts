import { describe, expect, it } from 'vitest';
import { hostsLabel, RECENT_HOSTS_MS, recentHosts } from '../src/app/library';
import type { NodeLive } from '../src/app/live';

const NOW = 10_000_000;
const node = (host: string | undefined, ts: number): NodeLive => ({
  open: 0, lastTs: ts, errorTs: 0, doneTs: 0, count: 1, where: host === undefined ? undefined : { host, ts },
});

describe('recentHosts', () => {
  it('lists the hosts of the project tower, newest first', () => {
    const nodes = new Map<string, NodeLive>([
      ['proj#a.x', node('laptop', NOW - 60_000)],
      ['proj#a.y', node('desk', NOW - 10_000)],
    ]);
    expect(recentHosts(nodes, new Set(['proj']), NOW)).toEqual(['desk', 'laptop']);
  });

  it('leaves out a host last seen more than 15 minutes ago', () => {
    const nodes = new Map<string, NodeLive>([
      ['proj#a.x', node('old', NOW - RECENT_HOSTS_MS - 1)],
      ['proj#a.y', node('fresh', NOW - RECENT_HOSTS_MS)],
    ]);
    expect(recentHosts(nodes, new Set(['proj']), NOW)).toEqual(['fresh']);
  });

  it('ignores nodes of another tower', () => {
    const nodes = new Map<string, NodeLive>([
      ['other#a.x', node('elsewhere', NOW)],
      ['proj#a.y', node('here', NOW)],
    ]);
    expect(recentHosts(nodes, new Set(['proj']), NOW)).toEqual(['here']);
  });

  it('ignores a node without where', () => {
    const nodes = new Map<string, NodeLive>([
      ['proj#a.x', node(undefined, NOW)],
    ]);
    expect(recentHosts(nodes, new Set(['proj']), NOW)).toEqual([]);
  });

  it('collapses duplicate hosts to their latest sighting', () => {
    const nodes = new Map<string, NodeLive>([
      ['proj#a.x', node('desk', NOW - 300_000)],
      ['proj#a.y', node('laptop', NOW - 100_000)],
      ['proj#b.z', node('desk', NOW - 1_000)],
    ]);
    expect(recentHosts(nodes, new Set(['proj']), NOW)).toEqual(['desk', 'laptop']);
  });
});

describe('hostsLabel', () => {
  it('joins up to three hosts and counts the rest', () => {
    expect(hostsLabel([])).toBe('');
    expect(hostsLabel(['a', 'b'])).toBe('@a · @b');
    expect(hostsLabel(['a', 'b', 'c', 'd', 'e'])).toBe('@a · @b · @c +2');
  });
});
