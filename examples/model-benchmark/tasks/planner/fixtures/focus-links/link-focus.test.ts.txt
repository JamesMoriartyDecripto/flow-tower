import { describe, expect, it } from 'vitest';
import { linkFocusFade } from '../src/app/scene/linkFocus';

const layerFade = (i: number) => [1, 0.1, 0.04][i];

describe('linkFocusFade', () => {
  it('keeps today\'s behaviour when no layer is focused', () => {
    expect(linkFocusFade(0, 1, undefined, false, layerFade)).toBe(0.1);
    expect(linkFocusFade(0, 1, undefined, true, layerFade)).toBe(0.1);
  });

  it('hides a link touching the focused layer unless highlighted', () => {
    expect(linkFocusFade(0, 1, 0, false, layerFade)).toBe(0);
  });

  it('keeps a highlighted link touching the focused layer readable', () => {
    expect(linkFocusFade(0, 1, 0, true, layerFade)).toBe(1);
    expect(linkFocusFade(1, 0, 0, true, layerFade)).toBe(1);
  });

  it('hides a link that does not touch the focused layer', () => {
    expect(linkFocusFade(1, 2, 0, true, layerFade)).toBe(0);
  });
});
