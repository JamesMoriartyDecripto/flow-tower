import { expect, openProject, test, ws } from './fixtures.ts';

// Dev-only hook from src/app/mountApp.tsx, declared once here so the evaluate callbacks can stay plain JavaScript.
declare global {
  interface Window {
    __flowTower: { store: { getState(): { focusLayer(i: number): void } } };
  }
}

// Pick the project with the largest layer: the window is short, so only a big layer overflows and gives the lists something to scroll.
const largestLayer = (id: string) => Math.max(...ws.towers[id].layers.map((l) => l.nodes.length));
const ID = ws.projects.reduce((best, p) => (largestLayer(p) > largestLayer(best) ? p : best));

/**
 * The white corner marks sit on the .panel frame. An absolute child of a scroll container scrolls with it, so a
 * panel that scrolls itself carries its corners away: each of these panels must scroll an inner .panel-scroll
 * instead, and the .panel element itself must not scroll.
 */
test.use({ viewport: { width: 1440, height: 600 } });

test('panel corners: the list panels scroll an inner element, not the frame', async ({ page }) => {
  // The layer with the most nodes overflows the short 600px window, so the lists have something to scroll.
  const layers = ws.towers[ID].layers;
  const index = layers.reduce((best, l, i) => (l.nodes.length > layers[best].nodes.length ? i : best), 0);
  await openProject(page, ID);
  await page.evaluate((i) => window.__flowTower.store.getState().focusLayer(i), index);

  for (const sel of ['.nodelist', '.layernav', '.legend']) {
    const panel = page.locator(sel);
    await expect(panel).toBeVisible();
    const frame = await panel.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(frame, `${sel} must not scroll itself`).toBe(true);
  }

  const list = page.locator('.nodelist');
  const scroller = list.locator('.panel-scroll');
  const overflows = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflows).toBe(true);
  await scroller.evaluate((el) => { el.scrollTop = 200; });
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // The frame stays put while its rows scroll.
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
});
