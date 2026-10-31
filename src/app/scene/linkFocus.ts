/**
 * Opacity factor for a cross-layer link while a layer is focused.
 *
 * With a layer focused, the focus camera hides the other layers, so any
 * cross-layer link would point at geometry the user cannot see. Such links are
 * therefore not drawn at all in focus mode; the node panel lists where they go
 * instead (#360). Without focus, links keep the dimmed layerFade behaviour.
 */
export function linkFocusFade(
  la: number,
  lb: number,
  focused: number | undefined,
  layerFade: (i: number) => number,
): number {
  if (focused === undefined) return Math.min(layerFade(la), layerFade(lb));
  return 0;
}
