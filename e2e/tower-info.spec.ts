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
