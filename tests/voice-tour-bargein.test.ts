import { beforeAll, describe, expect, it, vi } from 'vitest';

let isTourCommand: typeof import('../src/app/voice/tour').isTourCommand;
beforeAll(async () => {
  vi.stubGlobal('location', { search: '' }); // the store reads URL parameters at import
  ({ isTourCommand } = await import('../src/app/voice/tour'));
});

describe('isTourCommand (#275 tour commands interrupt the narration)', () => {
  it('is true for the tour controls', () => {
    expect(isTourCommand({ kind: 'step', dir: 1, what: 'auto' })).toBe(true);
    expect(isTourCommand({ kind: 'step', dir: -1, what: 'auto' })).toBe(true);
    expect(isTourCommand({ kind: 'back' })).toBe(true);
    expect(isTourCommand({ kind: 'tour', op: 'details', said: 'dettagli' })).toBe(true);
    expect(isTourCommand({ kind: 'tour', op: 'stop', said: 'stop' })).toBe(true);
  });

  it('is false for everything else', () => {
    expect(isTourCommand({ kind: 'tour', op: 'start', said: 'guided tour', lang: 'en' })).toBe(false);
    expect(isTourCommand({ kind: 'layer', index: 0 })).toBe(false);
    expect(isTourCommand({ kind: 'node', tower: 't', key: 'k' })).toBe(false);
    expect(isTourCommand({ kind: 'overview' })).toBe(false);
    expect(isTourCommand({ kind: 'unknown' })).toBe(false);
  });
});
