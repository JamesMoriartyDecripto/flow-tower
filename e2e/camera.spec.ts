import type { Page } from '@playwright/test';
import { expect, openProject, pressUntil, test, ws } from './fixtures.ts';

/** Camera distance and target through react-three-fiber's live state (CameraControls is the default controls). */
const camera = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as { __flowTower: { three: { get(): { controls: { distance: number; getTarget(v: object): { x: number } } } } } })
    .__flowTower.three.get().controls;
  return { distance: c.distance, x: c.getTarget({ x: 0, y: 0, z: 0 }).x };
});
const distance = async (page: Page) => (await camera(page)).distance;
const targetX = async (page: Page) => (await camera(page)).x;
const DEV = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
// Harness & Guardrails: the longest layer of dev-squad.
const HARNESS = 5;

async function selectInLayer(page: Page) {
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 0);
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === HARNESS);
  await page.waitForTimeout(1500);
  const before = await distance(page);
  await pressUntil(page, 'ArrowRight', (s) => !!s.selected);
  await page.waitForTimeout(1500);
  return before;
}

test('selecting a node zooms in on it and the camera follows the next ones', async ({ page }) => {
  await openProject(page, DEV);
  const before = await selectInLayer(page);
  expect(await distance(page), 'closer after selecting').toBeLessThan(before * 0.8);
  const x0 = await targetX(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);
  expect(Math.abs((await targetX(page)) - x0), 'the camera moved along with the selection').toBeGreaterThan(5);
});

test('with zoom to selection off, selecting keeps the distance', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow-tower:prefs', JSON.stringify({ zoomToSelection: false })));
  await openProject(page, DEV);
  const before = await selectInLayer(page);
  // Opening the inspector may only zoom out to keep the layer in the free area.
  expect(await distance(page)).toBeGreaterThanOrEqual(before - 0.5);
});

test('zoom is kept when moving to the next node of the same layer', async ({ page }) => {
  await openProject(page, DEV);
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
