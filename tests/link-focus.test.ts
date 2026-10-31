import { describe, expect, it } from 'vitest';
import { linkFocusFade } from '../src/app/scene/linkFocus';

const layerFade = (i: number) => [1, 0.1, 0.04][i];

describe('linkFocusFade', () => {
  it('keeps today\'s behaviour when no layer is focused', () => {
    expect(linkFocusFade(0, 1, undefined, layerFade)).toBe(0.1);
    expect(linkFocusFade(1, 2, undefined, layerFade)).toBe(0.04);
  });

  it('hides every cross-layer link in focus mode (#360)', () => {
    expect(linkFocusFade(0, 1, 0, layerFade)).toBe(0);
    expect(linkFocusFade(1, 0, 0, layerFade)).toBe(0);
    expect(linkFocusFade(1, 2, 0, layerFade)).toBe(0);
  });
});
