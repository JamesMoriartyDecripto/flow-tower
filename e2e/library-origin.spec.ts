import type { Page } from '@playwright/test';
import { expect, state, test, type Workspace } from './fixtures.ts';

/**
 * Library origin badges (#121f): a `flow-tower library` serve tags each project MINE (yours) or EXAMPLE
 * (shipped, read-only), so a card says which one is safe to edit. The dev server here runs the plain
 * `npm run dev` on examples/, so `origins` is absent by default: the second case pins that no chip shows,
 * and the first injects the field the library serve would add.
 */

/** Opens the Library and waits for its cards: a serve with several projects shows it on load. */
async function openLibrary(page: Page) {
  await page.goto('/?quality=eco');
  // The filter box takes focus as soon as the library opens, so open it with L only when it is still
  // closed; otherwise the key would be typed into that box instead.
  if (!(await state(page)).library) await page.keyboard.press('l');
  await expect(page.locator('.lib-grid')).toBeVisible();
  await expect(page.locator('[data-card]').first()).toBeVisible();
}

test('with origins: the first project is MINE and the rest are EXAMPLE', async ({ page }) => {
  // `origins` is a server-side decision the browser cannot make, so the real workspace is fetched and
  // tagged here: marking the first project mine and every other one example reproduces a library serve.
  await page.route('**/api/workspace', async (route) => {
    const res = await route.fetch();
    const ws = (await res.json()) as Workspace;
    const [first, ...rest] = ws.projects;
    ws.origins = { [first]: 'mine', ...Object.fromEntries(rest.map((p) => [p, 'example' as const])) };
    await route.fulfill({ response: res, json: ws });
  });
  await openLibrary(page);

  await expect(page.locator('.lib-origin.mine')).toHaveCount(1);
  await expect(page.locator('.lib-origin.mine')).toHaveText('MINE');
  // Every other card carries EXAMPLE: one chip per remaining project, and no card is unbadged.
  const cards = await page.locator('[data-card]').count();
  await expect(page.locator('.lib-origin.example')).toHaveCount(cards - 1);
  await expect(page.locator('.lib-origin.example').first()).toHaveText('EXAMPLE');

  await page.screenshot({ path: 'test-results/library-origin.png' });
});

test('without origins: the plain dev server shows no badge at all', async ({ page }) => {
  await openLibrary(page);
  await expect(page.locator('[data-card]').first()).toBeVisible();
  await expect(page.locator('.lib-origin')).toHaveCount(0);
});
