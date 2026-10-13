import { describe, expect, it } from 'vitest';
import { connectUrl, isLoopbackUrl } from '../src/app/hud/hubAdminModel';

describe('isLoopbackUrl', () => {
  it('treats localhost, the 127.x block and ::1 as loopback', () => {
    expect(isLoopbackUrl('http://127.0.0.1:5419')).toBe(true);
    expect(isLoopbackUrl('http://127.8.9.10')).toBe(true);
    expect(isLoopbackUrl('http://localhost:5317')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:5317')).toBe(true);
  });

  it('treats a tailnet name or a LAN address as reachable from other machines', () => {
    expect(isLoopbackUrl('https://hub.tailnet-abc.ts.net')).toBe(false);
    expect(isLoopbackUrl('http://192.168.1.20:5317')).toBe(false);
    expect(isLoopbackUrl('http://127.evil.example')).toBe(false);
  });

  it('does not treat an unparsable URL as loopback', () => {
    expect(isLoopbackUrl('not a url')).toBe(false);
    expect(isLoopbackUrl('')).toBe(false);
  });
});

describe('connectUrl', () => {
  it('reads the server URL out of the connect line', () => {
    expect(connectUrl('flow-tower connect http://127.0.0.1:5419 --token abc --machine ci')).toBe('http://127.0.0.1:5419');
  });

  it('returns undefined for a line without the connect prefix', () => {
    expect(connectUrl('something else')).toBeUndefined();
  });
});
