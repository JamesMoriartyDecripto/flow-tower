import { describe, expect, it } from 'vitest';
import { agoText, hubHost, SAT_CLASS, satText, satTitle, type SharingState } from '../src/app/sharing';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const at = (s: number) => NOW - s * 1000;

describe('satellite chip (#91)', () => {
  it('strips the scheme and trailing slashes from the hub host', () => {
    expect(hubHost('https://hub.example.com/')).toBe('hub.example.com');
    expect(hubHost('http://127.0.0.1:4321')).toBe('127.0.0.1:4321');
    expect(hubHost(undefined)).toBe('hub');
  });

  it('formats the time since the last send, coarsely', () => {
    expect(agoText(undefined, NOW)).toBe('never');
    expect(agoText(at(12), NOW)).toBe('12s ago');
    expect(agoText(at(59), NOW)).toBe('59s ago');
    expect(agoText(at(90), NOW)).toBe('2 min ago');
    expect(agoText(at(3 * 3600), NOW)).toBe('3 h ago');
    expect(agoText(at(72 * 3600), NOW)).toBe(new Date(at(72 * 3600)).toLocaleDateString());
    // A clock that runs backwards must not print a negative age.
    expect(agoText(NOW + 5000, NOW)).toBe('0s ago');
  });

  it('appends only the state word that matters right now', () => {
    const base: SharingState = { state: 'online', hub: 'https://hub.example.com', lastSentAt: at(12) };
    expect(satText(base, NOW)).toBe('SAT → hub.example.com · 12s ago');
    expect(satText({ ...base, state: 'queued', queued: 7 }, NOW)).toBe('SAT → hub.example.com · 12s ago · 7 queued');
    expect(satText({ ...base, state: 'paused' }, NOW)).toBe('SAT → hub.example.com · 12s ago · paused');
    expect(satText({ ...base, state: 'revoked' }, NOW)).toBe('SAT → hub.example.com · 12s ago · token refused');
    expect(satText({ state: 'online', hub: 'http://h' }, NOW)).toBe('SAT → h · never');
  });

  it('maps every state to an existing chip variant', () => {
    expect(SAT_CLASS).toEqual({ off: '', online: 'on', queued: 'warn', paused: 'dim', revoked: 'err' });
  });

  it('explains each state in one sentence', () => {
    for (const state of ['online', 'queued', 'paused', 'revoked'] as const) {
      const title = satTitle({ state, hub: 'https://hub.example.com' });
      expect(title).toContain('hub.example.com');
      expect(title).toContain('sharing settings');
    }
  });
});
