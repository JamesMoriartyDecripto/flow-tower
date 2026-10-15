import { describe, expect, it } from 'vitest';
import { hubCounts, machineRows, RECENT_MS } from '../src/server/machines';
import type { SatelliteView } from '../src/server/satellites';
import type { TokenInfo } from '../src/server/tokens';

const now = 1_000_000_000;

const token = (id: string, extra: Partial<TokenInfo> = {}): TokenInfo =>
  ({ id, createdAt: now - 10_000, ...extra });

const sat = (sender: string, extra: Partial<SatelliteView> = {}): SatelliteView =>
  ({ sender, queued: 0, dropped: 0, state: 'unknown', online: false, ...extra });

describe('machine rows (#92)', () => {
  it('builds a row from a token alone, offline with no satellite data', () => {
    const [row] = machineRows([token('dana')], [], now);
    expect(row).toEqual({ sender: 'dana', token: 'ft_dana…', state: 'active', online: false });
  });

  it('builds a tokenless row from a satellite alone, legacy default included', () => {
    const rows = machineRows([], [sat('default', { lastSeen: now, runtime: 'claude-code', host: 'laptop' })], now);
    expect(rows).toEqual([{
      sender: 'default', token: '', runtime: 'claude-code', host: 'laptop',
      lastSeen: now, queued: 0, state: 'unknown', online: true,
    }]);
  });

  it('marks a revoked token revoked and a paused one paused, active otherwise', () => {
    const rows = machineRows([token('a', { revokedAt: now }), token('b', { paused: true }), token('c')], [], now);
    expect(rows.map((r) => [r.sender, r.state])).toEqual([['a', 'revoked'], ['b', 'paused'], ['c', 'active']]);
    expect(hubCounts(rows).tokens).toBe(1);
  });

  it('merges the token row with the satellite data of the same sender', () => {
    const rows = machineRows([token('dana')], [sat('dana', { lastSeen: now - 1_000, lastEventAt: now, queued: 4, runtime: 'codex' })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sender: 'dana', token: 'ft_dana…', runtime: 'codex', queued: 4, online: true });
    // lastSeen is the newer of the heartbeat and the event, not whichever came last in the array.
    expect(rows[0].lastSeen).toBe(now);
  });

  it('keeps the online boundary at exactly five minutes: inside is online, past is not', () => {
    const inside = machineRows([token('a')], [sat('a', { lastEventAt: now - (RECENT_MS - 1) })], now)[0];
    const edge = machineRows([token('b')], [sat('b', { lastEventAt: now - RECENT_MS })], now)[0];
    const past = machineRows([token('c')], [sat('c', { lastEventAt: now - RECENT_MS - 1 })], now)[0];
    expect([inside.online, edge.online, past.online]).toEqual([true, false, false]);
    expect(RECENT_MS).toBe(300_000);
  });

  it('sorts online first, then lastSeen descending, then sender', () => {
    const offline = now - RECENT_MS - 1;
    const rows = machineRows(
      [token('zoe'), token('ada')],
      [
        sat('zoe', { lastEventAt: now - 1_000 }),
        sat('ada', { lastEventAt: now - 2_000 }),
        sat('legacy', { lastEventAt: now - 3_000 }),
        // Same staleness off the window: the sender name breaks the tie ("old" before "older").
        sat('older', { lastEventAt: offline }),
        sat('old', { lastEventAt: offline }),
      ],
      now,
    );
    expect(rows.map((r) => r.sender)).toEqual(['zoe', 'ada', 'legacy', 'old', 'older']);
    expect(hubCounts(rows)).toEqual({ online: 3, tokens: 2 });
  });

  it('never exposes more than "ft_<id>…" as a token label', () => {
    // A full credential is "ft_<id>_<secret>"; the row must stop at the id and an ellipsis.
    const rows = machineRows([token('dana')], [], now);
    expect(rows[0].token).toBe('ft_dana…');
    expect(rows[0].token).not.toMatch(/^ft_[a-z0-9-]+_[A-Za-z0-9_-]{8,}$/);
  });
});

describe('machine rows after a token rotation (#211)', () => {
  it('shows one row for a revoked id that was added again: the active record wins', () => {
    const rows = machineRows(
      [token('alice', { revokedAt: now - 5_000 }), token('alice')],
      [sat('alice', { lastEventAt: now })],
      now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sender: 'alice', state: 'active', online: true });
  });

  it('keeps the newer record when every record of an id is revoked', () => {
    const rows = machineRows(
      [token('bob', { revokedAt: now - 9_000, createdAt: now - 20_000 }), token('bob', { revokedAt: now - 1_000, createdAt: now - 8_000 })],
      [],
      now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sender: 'bob', state: 'revoked' });
    expect(rows[0].token).toBe('ft_bob…');
  });

  it('leaves an unrelated revoked id as one revoked row', () => {
    const rows = machineRows([token('carol', { revokedAt: now - 1_000 })], [], now);
    expect(rows).toEqual([{ sender: 'carol', token: 'ft_carol…', state: 'revoked', online: false }]);
  });
});
