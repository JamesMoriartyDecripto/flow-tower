import { describe, expect, it } from 'vitest';
import { voiceUnavailable } from '../src/app/voice/unavailable';

const UNREACHABLE = 'Voice commands need the local flow-tower server, which this page cannot reach.';

describe('voiceUnavailable', () => {
  it('says voice is off on a remote view when the hub answers 403', () => {
    const text = voiceUnavailable(403);
    expect(text).toContain('remote view of the hub');
    expect(text).toContain('flow-tower library');
  });

  it('keeps the unreachable text when there is no answer, 404 or 5xx', () => {
    expect(voiceUnavailable(undefined)).toBe(UNREACHABLE);
    expect(voiceUnavailable(404)).toBe(UNREACHABLE);
    expect(voiceUnavailable(502)).toBe(UNREACHABLE);
  });
});
