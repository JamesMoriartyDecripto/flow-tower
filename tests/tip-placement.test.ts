import { describe, expect, it } from 'vitest';
import { placeTip, type Box } from '../src/app/hud/tipPlacement.ts';

const view = { w: 1440, h: 800 };
const row = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

describe('placeTip', () => {
  it('puts a short tip below a mid-screen anchor', () => {
    const anchor = row(600, 300, 800, 330);
    const p = placeTip(anchor, { w: 200, h: 60 }, view);
    expect(p.side).toBe('below');
    expect(p.top).toBe(anchor.bottom + 8);
  });

  it('puts the tip above an anchor near the bottom', () => {
    const anchor = row(600, 740, 800, 770);
    const p = placeTip(anchor, { w: 200, h: 60 }, view);
    expect(p.side).toBe('above');
    expect(p.top + 60).toBe(anchor.top - 8);
  });

  it('places a tall tip beside a row in a right-edge panel, fully inside the view', () => {
    const anchor = row(1150, 400, 1410, 430);
    const tip = { w: 420, h: 700 };
    const p = placeTip(anchor, tip, view);
    expect(p.side).toBe('left');
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + tip.h).toBeLessThanOrEqual(view.h - 8);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + tip.w).toBeLessThanOrEqual(anchor.left - 8 + 0.5);
  });

  it('clamps a tip wider than the room on both sides inside the view', () => {
    // The anchor spans almost the full height, so neither above nor below fits, and the 1000 px tip fits
    // beside it on neither side: the fallback side is clamped into the view.
    const anchor = row(700, 8, 740, 780);
    const tip = { w: 1000, h: 100 };
    const p = placeTip(anchor, tip, view);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + tip.w).toBeLessThanOrEqual(view.w - 8);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + tip.h).toBeLessThanOrEqual(view.h - 8);
  });

  it('keeps the arrow on the tip, at least 10 px from its ends', () => {
    const anchor = row(1400, 100, 1440, 130);
    const tip = { w: 300, h: 80 };
    const p = placeTip(anchor, tip, view);
    expect(p.arrow).toBeGreaterThanOrEqual(10);
    expect(p.arrow).toBeLessThanOrEqual(tip.w - 10);
  });
});
