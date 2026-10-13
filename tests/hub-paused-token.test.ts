import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { authorize } from '../src/server/auth';
import { createEventHub } from '../src/server/events';
import { tokenStore } from '../src/server/tokens';

/**
 * A paused sender (#188) is not a revoked one: the hub must say "paused" so the satellite's owner knows the
 * token still exists. A wrong secret must never learn that an id is paused, so it gets the plain refusal.
 */
const PAUSED_BODY = { error: 'this machine is paused on the hub', state: 'paused' };

const home = mkdtempSync(join(tmpdir(), 'flow-tower-paused-'));
const servers: ReturnType<typeof createServer>[] = [];
afterAll(() => servers.forEach((s) => s.close()));

describe('tokenStore.check (#188)', () => {
  it('returns the id for an active token', () => {
    const store = tokenStore(home);
    const { token } = store.create('active-one');
    expect(store.check(token)).toEqual({ id: 'active-one' });
  });

  it('refuses a paused token with refused: paused', () => {
    const store = tokenStore(home);
    const { token } = store.create('paused-one');
    store.pause('paused-one', true);
    expect(store.check(token)).toEqual({ refused: 'paused' });
    expect(store.verify(token)).toBeUndefined();
  });

  it('returns undefined for a revoked token', () => {
    const store = tokenStore(home);
    const { token } = store.create('revoked-one');
    store.revoke('revoked-one');
    expect(store.check(token)).toBeUndefined();
  });

  it('returns undefined for a wrong secret on a paused id (no existence leak)', () => {
    const store = tokenStore(home);
    const { token } = store.create('paused-two');
    store.pause('paused-two', true);
    // Same id, different secret: the parse succeeds, the hash does not match.
    const forged = `ft_paused-two_${'x'.repeat(43)}`;
    expect(forged).not.toBe(token);
    expect(store.check(forged)).toBeUndefined();
  });

  it('returns undefined for garbage and for an unknown id', () => {
    const store = tokenStore(home);
    expect(store.check('not a token')).toBeUndefined();
    expect(store.check(42)).toBeUndefined();
    expect(store.check(undefined)).toBeUndefined();
    expect(store.check('ft_nobody_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeUndefined();
  });
});

describe('authorize with a paused token (#188)', () => {
  /** A fake request carrying only the header: authorize reads nothing else for a presented token. */
  const withToken = (token: string) => ({ headers: { 'x-flow-tower-token': token } }) as unknown as IncomingMessage;

  it('answers paused for a valid but paused token, and ok for an active one', () => {
    const store = tokenStore(home);
    const { token: live } = store.create('authz-live');
    const { token: parked } = store.create('authz-parked');
    store.pause('authz-parked', true);
    expect(authorize(withToken(live), { home })).toEqual({ ok: true, sender: 'authz-live' });
    expect(authorize(withToken(parked), { home })).toEqual({ ok: false, paused: true });
  });

  it('does not mark a wrong secret as paused', () => {
    const store = tokenStore(home);
    store.create('authz-guess');
    store.pause('authz-guess', true);
    const forged = `ft_authz-guess_${'y'.repeat(43)}`;
    expect(authorize(withToken(forged), { home })).toEqual({ ok: false });
  });
});

describe('events route answers the paused body (#188)', () => {
  async function start() {
    const hub = createEventHub(() => undefined, () => undefined, { home });
    const server = createServer((rq, rs) => hub.handle(rq, rs));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/events`;
  }
  const post = (url: string, headers: Record<string, string>) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ kind: 'log' }) });

  it('sends the paused body for a paused token and the refused body for a revoked one', async () => {
    const url = await start();
    const store = tokenStore(home);
    const { token: parked } = store.create('route-parked');
    store.pause('route-parked', true);
    const paused = await post(url, { 'x-flow-tower-token': parked });
    expect(paused.status).toBe(401);
    expect(await paused.json()).toEqual(PAUSED_BODY);

    const { token: gone } = store.create('route-gone');
    store.revoke('route-gone');
    const refused = await post(url, { 'x-flow-tower-token': gone });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: 'bad or missing token', state: 'refused' });
  });
});
