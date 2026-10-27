import { describe, expect, it } from 'vitest';
// No declaration file for mode.mjs (batch.d.mts is the precedent for one); the untyped import is accepted here.
// @ts-expect-error TS7016: mode.mjs has no .d.mts yet
import { pickMode } from '../tools/squad/mode.mjs';

const NONE = { oneshot: false, batch: false, loop: false };

describe('pickMode', () => {
  it('the coder with no flag runs the tool loop', () => {
    expect(pickMode({ role: 'coder', flags: NONE, pace: undefined })).toEqual({ mode: 'loop' });
  });

  it('the coder with --oneshot throws, since it needs its tools', () => {
    expect(() => pickMode({ role: 'coder', flags: { ...NONE, oneshot: true }, pace: undefined }))
      .toThrow('the coder needs tools: --oneshot/--batch are for reviewer and security');
  });

  it('the coder with --loop is accepted and is the loop', () => {
    expect(pickMode({ role: 'coder', flags: { ...NONE, loop: true }, pace: undefined })).toEqual({ mode: 'loop' });
  });

  it('a reviewer with no pace is one request by default', () => {
    expect(pickMode({ role: 'reviewer', flags: NONE, pace: undefined })).toEqual({ mode: 'oneshot', why: 'default' });
  });

  it('a reviewer with SQUAD_PACE=now is oneshot, decided by the pace', () => {
    expect(pickMode({ role: 'reviewer', flags: NONE, pace: 'now' })).toEqual({ mode: 'oneshot', why: 'pace' });
  });

  it('a reviewer with SQUAD_PACE=relaxed is oneshot, decided by the pace', () => {
    expect(pickMode({ role: 'reviewer', flags: NONE, pace: 'relaxed' })).toEqual({ mode: 'oneshot', why: 'pace' });
  });

  it('a reviewer with SQUAD_PACE=overnight is a batch, decided by the pace', () => {
    expect(pickMode({ role: 'reviewer', flags: NONE, pace: 'overnight' })).toEqual({ mode: 'batch', why: 'pace' });
  });

  it('a security run with --loop and SQUAD_PACE=overnight is the loop: the flag wins', () => {
    expect(pickMode({ role: 'security', flags: { ...NONE, loop: true }, pace: 'overnight' })).toEqual({ mode: 'loop', why: 'flag' });
  });

  it('--oneshot with --loop throws', () => {
    expect(() => pickMode({ role: 'reviewer', flags: { ...NONE, oneshot: true, loop: true }, pace: undefined }))
      .toThrow('--oneshot, --batch and --loop are exclusive');
  });

  it('an unknown pace throws', () => {
    expect(() => pickMode({ role: 'reviewer', flags: NONE, pace: 'daily' }))
      .toThrow('SQUAD_PACE must be now, relaxed or overnight');
  });
});
