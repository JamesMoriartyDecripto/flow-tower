import { expect, openProject, test } from './fixtures.ts';

/**
 * The HUD tooltip of a long node description in the right node list must stay inside the window: it used to
 * run off the bottom and get squeezed into a narrow column at the right edge.
 */
test.use({ viewport: { width: 1440, height: 800 } });

test('tooltip: a long node description stays inside the window', async ({ page }) => {
  await openProject(page, 'voice-commands');
  // Focusing a layer opens its node list on the right, the same way the keyboard does.
  await page.evaluate(() => (window as unknown as { __flowTower: { store: { getState(): { focusLayer(i: number): void } } } }).__flowTower.store.getState().focusLayer(3));
  const row = page.locator('.nodelist button, .nodelist [title]').filter({ hasText: 'Spoken reply' }).first();
  await row.hover();
  const tip = page.locator('.hud-tip');
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  expect(box).not.toBeNull();
  const b = box!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(800);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(1440);
  expect(b.width).toBeGreaterThanOrEqual(300);
});
