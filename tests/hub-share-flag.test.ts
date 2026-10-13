import { describe, expect, it } from 'vitest';
import { unsentLabel, shareNameOf } from '../src/app/library.ts';
import { createSatellites, HeartbeatSchema, keepValidShares, SHARE_FLAGS_MAX } from '../src/server/satellites.ts';
import { createRelay } from '../src/server/relay.ts';

const TOKEN = 'ft_dana_fake-test-secret';
const hub = 'http://hub.test';

/** A fake fetch that records the heartbeat bodies it receives and answers 204. */
function fakeHub() {
  const bodies: Record<string, unknown>[] = [];
  const send = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/api/heartbeat')) bodies.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  }) as typeof globalThis.fetch;
  return { bodies, send };
}

describe('heartbeat carries the flagged shares (#190)', () => {
  it('adds one entry per failing share, with the name and a flag only', async () => {
    const { bodies, send } = fakeHub();
    const failing = ['demo', 'alpha-box'];
    const relay = createRelay({ url: hub, token: TOKEN, fetch: send, shareErrors: () => failing, recheckMs: 60_000 });
    await relay.heartbeat();
    relay.stop();
    expect(bodies[0]).toMatchObject({ shares: [{ name: 'demo', error: true }, { name: 'alpha-box', error: true }] });
  });

  it('omits the key when no share failed, so an old hub sees the body it always did', async () => {
    const { bodies, send } = fakeHub();
    const relay = createRelay({ url: hub, token: TOKEN, fetch: send, shareErrors: () => [], recheckMs: 60_000 });
    await relay.heartbeat();
    relay.stop();
    expect(bodies[0]).not.toHaveProperty('shares');
  });

  it('never sends error text, even when the sync has one', async () => {
    const { bodies, send } = fakeHub();
    const relay = createRelay({ url: hub, token: TOKEN, fetch: send, shareErrors: () => ['demo'], recheckMs: 60_000 });
    await relay.heartbeat();
    relay.stop();
    expect(JSON.stringify(bodies[0])).not.toMatch(/error":"|message|secret|password/i);
    expect(JSON.stringify(bodies[0])).not.toContain(TOKEN);
  });
});

describe('the hub registry keeps the flags per sender (#190)', () => {
  const base = { queued: 0, dropped: 0, state: 'online' };

  it('stores and lists the flagged names, de-duplicated', () => {
    const sats = createSatellites(() => 1000);
    sats.beat('dana', { ...base, shares: [{ name: 'demo', error: true }, { name: 'demo', error: true }] });
    expect(sats.list()[0].flagged).toEqual(['demo']);
  });

  it('clears the flags when a later heartbeat has no shares', () => {
    const sats = createSatellites(() => 1000);
    sats.beat('dana', { ...base, shares: [{ name: 'demo', error: true }] });
    sats.beat('dana', base);
    expect(sats.list()[0].flagged).toBeUndefined();
  });

  it('accepts names of the folder alphabet up to 64 characters', () => {
    expect(HeartbeatSchema.safeParse({ ...base, shares: [{ name: 'a-1', error: true }] }).success).toBe(true);
    expect(HeartbeatSchema.safeParse({ ...base, shares: [{ name: 'a'.repeat(64), error: true }] }).success).toBe(true);
  });

  it('refuses a name outside [a-z0-9-], or longer than 64 characters', () => {
    for (const name of ['Demo', 'a b', '../x', 'a_b', '', 'a'.repeat(65), 'a/b']) {
      expect(HeartbeatSchema.safeParse({ ...base, shares: [{ name, error: true }] }).success).toBe(false);
    }
  });

  it('refuses more than 100 flagged shares', () => {
    const shares = Array.from({ length: SHARE_FLAGS_MAX + 1 }, (_, i) => ({ name: `s${i}`, error: true as const }));
    expect(HeartbeatSchema.safeParse({ ...base, shares }).success).toBe(false);
    expect(HeartbeatSchema.safeParse({ ...base, shares: shares.slice(0, SHARE_FLAGS_MAX) }).success).toBe(true);
  });

  it('refuses an entry whose error is not the literal true', () => {
    expect(HeartbeatSchema.safeParse({ ...base, shares: [{ name: 'demo', error: 'boom' }] }).success).toBe(false);
    expect(HeartbeatSchema.safeParse({ ...base, shares: [{ name: 'demo' }] }).success).toBe(false);
  });
});

describe('a bad share entry does not drop the heartbeat (#190)', () => {
  const base = { queued: 3, dropped: 0, state: 'online' };

  it('keeps the valid flags and drops the invalid ones, so the heartbeat still parses', () => {
    const body = { ...base, shares: [{ name: 'Bad Name', error: true }, { name: 'demo', error: true }, { name: 'x', error: 'boom' }] };
    const parsed = HeartbeatSchema.safeParse(keepValidShares(body));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.shares).toEqual([{ name: 'demo', error: true }]);
    expect(parsed.success && parsed.data.queued).toBe(3);
  });

  it('caps the flags at the maximum, keeping the first valid ones', () => {
    const shares = Array.from({ length: SHARE_FLAGS_MAX + 5 }, (_, i) => ({ name: `s${i}`, error: true }));
    const parsed = HeartbeatSchema.safeParse(keepValidShares({ ...base, shares }));
    expect(parsed.success && parsed.data.shares?.length).toBe(SHARE_FLAGS_MAX);
  });

  it('leaves a body without shares untouched', () => {
    expect(keepValidShares(base)).toBe(base);
  });
});

describe('the library card label (#190)', () => {
  const flags = { box: ['demo'] };

  it('shows the amber note for a flagged share of that sender', () => {
    expect(unsentLabel('box', shareNameOf('demo'), flags)).toEqual({
      text: 'newer version not sent',
      title: 'The teammate has a newer version with an error; the hub keeps the last valid one',
    });
  });

  it('shows nothing for a share the sender did not flag', () => {
    expect(unsentLabel('box', 'other', flags)).toBeUndefined();
  });

  it('shows nothing for the same name from another sender', () => {
    expect(unsentLabel('laptop', 'demo', flags)).toBeUndefined();
  });

  it('shows nothing for a local project or one with no source', () => {
    expect(unsentLabel('local', 'demo', flags)).toBeUndefined();
    expect(unsentLabel(undefined, 'demo', flags)).toBeUndefined();
  });

  it('takes the share name as the last segment of the project id', () => {
    expect(shareNameOf('box-1/demo')).toBe('demo');
    expect(shareNameOf('demo')).toBe('demo');
  });
});
