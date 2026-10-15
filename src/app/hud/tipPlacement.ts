/** A rectangle in screen pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Side = 'below' | 'above' | 'left' | 'right';

export interface Placement {
  /** Top-left corner of the tip, in the same screen pixels as the anchor. */
  left: number;
  top: number;
  side: Side;
  /** Offset of the arrow along the tip's edge: from its left for below/above, from its top for left/right. */
  arrow: number;
}

/** Keeps the tip this far from the window edges. Tooltip.tsx uses it to cap a tip taller than the window. */
export const TIP_MARGIN = 8;

const ARROW_MIN = 10;

/** Like Math.min(Math.max(v, lo), hi), but `lo` wins when the range is empty: a tip never leaves the view's start edge. */
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Picks where a tooltip goes next to its anchor. Order: below the anchor if it fits, else above, else beside
 * it (left, then right). The side panels of the HUD sit at the window edges, so a row there often has no
 * room above or below for a long text, but has room beside the panel. If nothing fits, the side with the
 * most room wins and the tip is clamped into the view. Pure: no DOM, so it can be unit-tested.
 */
export function placeTip(
  anchor: Box,
  tip: { w: number; h: number },
  view: { w: number; h: number },
  gap = 8,
  margin = TIP_MARGIN,
): Placement {
  const fits: Record<Side, boolean> = {
    below: anchor.bottom + gap + tip.h <= view.h - margin,
    above: anchor.top - gap - tip.h >= margin,
    left: anchor.left - gap - tip.w >= margin,
    right: anchor.right + gap + tip.w <= view.w - margin,
  };
  const room: Record<Side, number> = {
    below: view.h - margin - (anchor.bottom + gap),
    above: anchor.top - gap - margin,
    left: anchor.left - gap - margin,
    right: view.w - margin - (anchor.right + gap),
  };
  const order: Side[] = ['below', 'above', 'left', 'right'];
  const side = order.find((s) => fits[s]) ?? order.reduce((best, s) => (room[s] > room[best] ? s : best));

  const cx = (anchor.left + anchor.right) / 2;
  const cy = (anchor.top + anchor.bottom) / 2;
  if (side === 'below' || side === 'above') {
    // Centered on the anchor, then pulled back inside the view horizontally.
    const left = clamp(cx - tip.w / 2, margin, view.w - margin - tip.w);
    const top = clamp(
      side === 'below' ? anchor.bottom + gap : anchor.top - gap - tip.h,
      margin,
      view.h - margin - tip.h,
    );
    return { left, top, side, arrow: clamp(cx - left, ARROW_MIN, tip.w - ARROW_MIN) };
  }
  // Centered on the anchor, then pulled back inside the view vertically.
  const top = clamp(cy - tip.h / 2, margin, view.h - margin - tip.h);
  const left = clamp(
    side === 'right' ? anchor.right + gap : anchor.left - gap - tip.w,
    margin,
    view.w - margin - tip.w,
  );
  return { left, top, side, arrow: clamp(cy - top, ARROW_MIN, tip.h - ARROW_MIN) };
}
