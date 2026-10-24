import type { Page } from '@playwright/test';
import { expect, state, test } from './fixtures.ts';

/**
 * Tower card (#295) in the right panel at Tower overview: it shows the facts of the tower's library card,
 * gives way to the node list when a layer is focused, and can be reduced to its title bar (remembered).
 */

/** Opens the tower card's page and waits until the card is on screen. */
async function openTowerInfo(page: Page) {
  await page.goto('/?tower=team-hub&quality=eco');
  await expect(page.locator('.towerinfo')).toBeVisible();
}

test('at overview the tower card shows the tower and the Nodes value of its library card', async ({ page }) => {
  await openTowerInfo(page);
  const card = page.locator('.towerinfo');
  await expect(card.locator('.title')).toContainText('Team Hub');

  const stats = card.locator('.lib-stats dd');
  await expect(stats).toHaveCount(4);
  const nodes = await card.locator('.lib-stats div', { hasText: 'Nodes' }).locator('dd').textContent();

  // The library card of the same project shows the same Nodes value.
  if (!(await state(page)).library) await page.keyboard.press('l');
  await expect(page.locator('.lib-grid')).toBeVisible();
  const libCard = page.locator('[data-card]').filter({ has: page.locator('.lib-name', { hasText: /^Team Hub$/ }) });
  await expect(libCard).toHaveCount(1);
  const libNodes = await libCard.locator('.lib-stats div', { hasText: 'Nodes' }).locator('dd').textContent();
  expect(libNodes).toBe(nodes);
  await page.keyboard.press('Escape');
  await expect(page.locator('.lib-grid')).toHaveCount(0);
});

test('focusing a layer swaps the tower card for the node list; Escape brings it back', async ({ page }) => {
  await openTowerInfo(page);
  await page.keyboard.press('1');
  await expect(page.locator('.towerinfo')).toHaveCount(0);
  await expect(page.locator('.nodelist')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.towerinfo')).toBeVisible();
});

test('selecting a node in the list shows the inspector and hides the tower card', async ({ page }) => {
  await openTowerInfo(page);
  await page.keyboard.press('1');
  await expect(page.locator('.nodelist')).toBeVisible();

  await page.locator('.nodelist button').first().click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.towerinfo')).toHaveCount(0);
});

test('the toggle reduces the card to its title bar, remembered across reloads', async ({ page }) => {
  await openTowerInfo(page);
  const toggle = page.locator('.towerinfo-toggle');

  await toggle.click();
  await expect(page.locator('.towerinfo')).toHaveClass(/reduced/);
  await expect(page.locator('.towerinfo .panel-scroll')).toBeHidden();

  await page.reload();
  await expect(page.locator('.towerinfo')).toBeVisible();
  await expect(page.locator('.towerinfo')).toHaveClass(/reduced/);
  await expect(page.locator('.towerinfo .panel-scroll')).toBeHidden();

  // Left open at the end: the preference is per browser context, so the card is open for later tests.
  await page.locator('.towerinfo-toggle').click();
  await expect(page.locator('.towerinfo')).not.toHaveClass(/reduced/);
  await expect(page.locator('.towerinfo .panel-scroll')).toBeVisible();
});

test('on a phone-sized window the open card stays inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTowerInfo(page);
  const box = await page.locator('.towerinfo').boundingBox();
  expect(box, 'tower card box').not.toBeNull();
  expect(box!.x + box!.width, 'right edge of the tower card').toBeLessThanOrEqual(390);
});

test("the card's content clears the corner marks, open and reduced", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTowerInfo(page);
  const card = page.locator('.towerinfo');
  const toggle = page.locator('.towerinfo-toggle');
  const name = page.locator('.towerinfo-name');

  // The corner marks are 14px squares 3px from the edges: content keeps 18px clear of them.
  const panel = await card.boundingBox();
  expect(panel, 'tower card box').not.toBeNull();
  const toggleBox = await toggle.boundingBox();
  const nameBox = await name.boundingBox();
  expect(toggleBox, 'toggle box').not.toBeNull();
  expect(nameBox, 'name box').not.toBeNull();
  expect(toggleBox!.x + toggleBox!.width, 'toggle clears the top-right mark').toBeLessThanOrEqual(panel!.x + panel!.width - 18);
  expect(nameBox!.x, 'name clears the bottom-left mark').toBeGreaterThanOrEqual(panel!.x + 18);
  const paddingBottom = await page.locator('.towerinfo > .panel-scroll').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(paddingBottom, 'last row clears the bottom-left mark').toBeGreaterThanOrEqual(18);

  // Reduced: only the title row is left, and it must clear the marks too.
  await toggle.click();
  await expect(card).toHaveClass(/reduced/);
  const reducedPanel = await card.boundingBox();
  const reducedToggle = await toggle.boundingBox();
  const reducedName = await name.boundingBox();
  expect(reducedName!.x, 'reduced name clears the bottom-left mark').toBeGreaterThanOrEqual(reducedPanel!.x + 18);
  expect(reducedToggle!.x + reducedToggle!.width, 'reduced toggle clears the top-right mark').toBeLessThanOrEqual(reducedPanel!.x + reducedPanel!.width - 18);

  // Leave the card open for later tests, as the toggle test does.
  await toggle.click();
  await expect(card).not.toHaveClass(/reduced/);
});

/** Horizontal projection offset of the camera (nonzero when the scene is shifted for a panel). */
const offsetX = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __flowTower: { three: { get(): { camera: { view?: { offsetX: number } } } } } };
  return w.__flowTower.three.get().camera.view?.offsetX ?? 0;
});

/**
 * Waits until the projection offset has stopped easing (two reads 250 ms apart agree) and returns it.
 * The offset glides toward its goal for a few hundred ms, so a single read can land mid-animation.
 */
async function settledOffset(page: Page): Promise<number> {
  let last = 0;
  await expect
    .poll(async () => {
      const first = await offsetX(page);
      await page.waitForTimeout(250);
      last = await offsetX(page);
      return Math.abs(last - first);
    })
    .toBeLessThan(1);
  return last;
}

test('reducing the card re-frames the scene', async ({ page }) => {
  await openTowerInfo(page);
  const toggle = page.locator('.towerinfo-toggle');

  const open = await settledOffset(page);

  // Only the offset's change is checked, not its size: the Layers panel and the open card balance each other.
  await toggle.click();
  const reduced = await settledOffset(page);
  expect(Math.abs(reduced - open), 'offset moves when the card is reduced').toBeGreaterThanOrEqual(50);

  await toggle.click();
  const back = await settledOffset(page);
  expect(Math.abs(back - open), 'offset returns when the card reopens').toBeLessThanOrEqual(20);
});

test('keyboard: Esc on the card\'s toggle returns focus to the scene', async ({ page }) => {
  await openTowerInfo(page);
  await page.locator('.towerinfo-toggle').focus();
  await page.keyboard.press('Escape');

  const inCard = await page.evaluate(() => !!document.activeElement?.closest('.towerinfo'));
  expect(inCard, 'focus left the tower card').toBe(false);
  await expect(page.locator('.towerinfo')).toBeVisible();
  expect((await state(page)).focusedLayer).toBeUndefined();
});
