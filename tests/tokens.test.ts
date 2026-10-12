import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenStore } from '../src/server/tokens';

/** Per-sender hub tokens (#83): the file holds hashes only, and a revoke or a pause locks a sender out. */
describe('token store', () => {
  it('creates, verifies, revokes and pauses senders', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-tokens-'));
    const store = tokenStore(home);
    const { token } = store.create('alice');
    expect(token.startsWith('ft_alice_')).toBe(true);
    expect(store.verify(token)).toEqual({ id: 'alice' });

    // A guessed or edited secret gets nowhere.
    expect(store.verify(`ft_alice_${'A'.repeat(43)}`)).toBeUndefined();
    expect(store.verify('ft_alice_')).toBeUndefined();
    expect(store.verify('nonsense')).toBeUndefined();
    expect(store.verify(undefined)).toBeUndefined();

    // Revoked and paused both refuse.
    const bob = store.create('bob').token;
    store.pause('bob', true);
    expect(store.verify(bob)).toBeUndefined();
    expect(store.list().find((t) => t.id === 'bob')).toMatchObject({ paused: true });
    store.pause('bob', false);
    expect(store.verify(bob)).toEqual({ id: 'bob' });
    store.revoke('alice');
    expect(store.verify(token)).toBeUndefined();
    expect(store.list().find((t) => t.id === 'alice')?.revokedAt).toBeTypeOf('number');

    // A revoked id may be reused; an active one may not.
    expect(store.create('alice').token.startsWith('ft_alice_')).toBe(true);
    expect(() => store.create('bob')).toThrow(/already exists/);
    expect(() => store.create('Alice')).toThrow(/a-z/);
    expect(() => store.create('a'.repeat(33))).toThrow(/a-z/);
    expect(() => store.create('../etc')).toThrow(/a-z/);

    // The metadata never leaks the hash, and the plaintext is nowhere on disk.
    expect(Object.keys(store.list()[0])).not.toContain('sha256');
    const raw = readFileSync(join(home, 'tokens.json'), 'utf8');
    expect(raw).not.toContain(token);
    expect(raw).toContain('sha256');
    // Personal: readable by the owner only.
    expect(statSync(join(home, 'tokens.json')).mode & 0o777).toBe(0o600);
  });

  // A second store over the same folder (another process) must see a revoke made in between.
  it('reloads the file when it changes', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-tokens-'));
    const a = tokenStore(home);
    const b = tokenStore(home);
    const { token } = a.create('carol');
    expect(b.verify(token)).toEqual({ id: 'carol' });
    a.revoke('carol');
    expect(b.verify(token)).toBeUndefined();
  });
});

/** Tailnet enrolment (#164): the same login rotates its own machine's token, nobody else can take it over. */
describe('token enrolment', () => {
  it('mints on first enrol and rotates for the same login', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-tokens-'));
    const store = tokenStore(home);
    const first = store.enroll('laptop-1', 'alice@example.com');
    expect(first.rotated).toBe(false);
    expect(store.verify(first.token)).toEqual({ id: 'laptop-1' });

    const second = store.enroll('laptop-1', 'alice@example.com');
    expect(second.rotated).toBe(true);
    expect(store.verify(first.token)).toBeUndefined();
    expect(store.verify(second.token)).toEqual({ id: 'laptop-1' });
    expect(store.list().find((t) => t.id === 'laptop-1' && t.revokedAt === undefined)).toMatchObject({ login: 'alice@example.com' });
  });

  it('refuses another login, a missing login, and a hand-made id', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-tokens-'));
    const store = tokenStore(home);
    const { token } = store.enroll('laptop-1', 'alice@example.com');
    expect(() => store.enroll('laptop-1', 'mallory@example.com')).toThrow(/^conflict:/);
    expect(store.verify(token)).toEqual({ id: 'laptop-1' });

    store.create('hand-made');
    expect(() => store.enroll('hand-made', 'alice@example.com')).toThrow(/^conflict:/);
    expect(store.list().find((t) => t.id === 'hand-made')?.login).toBeUndefined();
  });

  it('lets a revoked id be enrolled again', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-tokens-'));
    const store = tokenStore(home);
    store.enroll('laptop-2', 'bob@example.com');
    store.revoke('laptop-2');
    const again = store.enroll('laptop-2', 'mallory@example.com');
    expect(again.rotated).toBe(false);
    expect(store.verify(again.token)).toEqual({ id: 'laptop-2' });
  });

  it('keeps a paused machine paused when its owner enrols it again', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-tokens-'));
    const store = tokenStore(home);
    store.enroll('laptop-4', 'alice@example.com');
    store.pause('laptop-4', true);
    const again = store.enroll('laptop-4', 'alice@example.com');
    expect(store.verify(again.token)).toBeUndefined();
    store.pause('laptop-4', false);
    expect(store.verify(again.token)).toEqual({ id: 'laptop-4' });
  });

  it('rejects a bad id or an empty login', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-tokens-'));
    const store = tokenStore(home);
    expect(() => store.enroll('Bad Id', 'alice@example.com')).toThrow(/a-z/);
    expect(() => store.enroll('laptop-3', '')).toThrow(/login/);
    expect(() => store.enroll('laptop-3', '   ')).toThrow(/login/);
  });
});
