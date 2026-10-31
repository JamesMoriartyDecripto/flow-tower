/**
 * Opacity factor for a cross-layer link while a layer is focused.
 *
 * The focus camera looks down through the layers above the focused one, so a
 * link that merely dims to layerFade (0.1 / 0.04) still shows up as a haze over
 * the focused layer. With focus active, links touching the focused layer stay
 * fully readable only when they are highlighted; everything else is hidden.
 */
export function linkFocusFade(
  la: number,
  lb: number,
  focused: number | undefined,
  highlighted: boolean,
  layerFade: (i: number) => number,
): number {
  if (focused === undefined) return Math.min(layerFade(la), layerFade(lb));
  if (highlighted && (la === focused || lb === focused)) return 1;
  return 0;
}
