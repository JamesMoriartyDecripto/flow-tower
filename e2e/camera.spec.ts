import type { Page } from '@playwright/test';
import { expect, openProject, pressUntil, test, ws } from './fixtures.ts';

/** Camera distance through react-three-fiber's live state (CameraControls is the default controls). */
const distance = (page: Page) => page.evaluate(() =>
  (window as unknown as { __flowTower: { three: { get(): { controls: { distance: number } } } } }).__flowTower.three.get().controls.distance);

test('zoom is kept when moving to the next node of the same layer', async ({ page }) => {
  await openProject(page, ws.projects.find((p) => p.startsWith('dev-squad/'))!);
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 0);
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 1);
  await pressUntil(page, 'ArrowRight', (s) => !!s.selected);
  await page.waitForTimeout(1500); // inspector open, panels fitted
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  await page.waitForTimeout(1500);
  const zoomed = await distance(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);
  expect(Math.abs((await distance(page)) - zoomed), 'camera distance after selecting the neighbour').toBeLessThan(0.5);
});
