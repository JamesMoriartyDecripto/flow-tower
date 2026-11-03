import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

const box = (left: number, top: number, width: number, height: number): Box =>
  ({ left, top, right: left + width, bottom: top + height, width, height });

// The store reads location at import time, so stub it before loading hudFrame (node has no window).
globalThis.location = { search: '' } as unknown as Location;
const { freeRect } = await import('../src/app/scene/hudFrame');

// Stub the DOM: each selector maps to a box; unknown selectors match nothing.
function stubPanels(panels: Record<string, Box>) {
  globalThis.document = {
    querySelector: (sel: string) => (sel in panels ? { getBoundingClientRect: () => panels[sel] } : null),
  } as unknown as Document;
}

const hadDocument = 'document' in globalThis;
const savedDocument = globalThis.document;

describe('freeRect', () => {
  beforeEach(() => stubPanels({}));
  afterEach(() => {
    if (hadDocument) globalThis.document = savedDocument;
    else delete (globalThis as { document?: Document }).document;
  });

  it('ignores a hidden 0x0 layernav', () => {
    stubPanels({ '.layernav': box(0, 0, 0, 0) });
    expect(freeRect(390, 844)).toEqual({ left: 16, top: 16, right: 374, bottom: 828, w: 358, h: 812 });
  });

  it('treats a full-width sheet as a bottom limit only', () => {
    stubPanels({ '.topbar': box(0, 0, 390, 60), '.inspector': box(0, 500, 390, 344) });
    expect(freeRect(390, 844)).toEqual({ left: 16, top: 76, right: 374, bottom: 484, w: 358, h: 408 });
  });

  it('still limits the left side for a narrow layernav', () => {
    stubPanels({ '.layernav': box(0, 0, 240, 844) });
    expect(freeRect(1280, 800).left).toBe(256);
  });
});
