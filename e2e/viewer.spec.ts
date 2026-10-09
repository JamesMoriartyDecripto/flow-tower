import type { Page } from '@playwright/test';
import { expect, openProject, state, test, ws, tower } from './fixtures.ts';

/** File viewer: formatted Markdown, source, line wrap (W / V), choices remembered, keys kept inside. */

// A project node with a long-lined Markdown file (README-style prose lines are long).
const pick = (() => {
  for (const id of ws.projects) {
    for (const n of tower(id).layers.flatMap((l) => l.nodes)) {
      const md = n.files.find((f) => f.endsWith('.md'));
      if (md) return { id, files: n.files, index: n.files.indexOf(md) };
    }
  }
  throw new Error('no node with a Markdown file');
})();

const open = (page: Page) => page.evaluate((f) => (window as unknown as { __flowTower: { store: { getState(): { openFile(x: object): void } } } })
  .__flowTower.store.getState().openFile({ tower: f.id, files: f.files, index: f.index }), pick);
const overflows = (page: Page) => page.evaluate(() => { const c = document.querySelector<HTMLElement>('.viewer .code'); return c ? c.scrollWidth > c.clientWidth + 2 : false; });

test('file viewer: formatted Markdown, source, wrap', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 }); // narrow, so long source lines overflow
  await openProject(page, pick.id);
  await open(page);
  await expect(page.locator('.viewer .md-view')).toBeVisible();

  await page.keyboard.press('v');
  await expect(page.locator('.viewer .code pre')).toBeVisible();
  await expect(page.locator('.viewer .md-view')).toHaveCount(0);
  const before = await overflows(page);
  await page.keyboard.press('w');
  await expect(page.locator('.viewer .code.wrap')).toBeVisible();
  expect(await overflows(page), 'wrapped source has no horizontal scroll').toBe(false);
  if (before) expect(before).toBe(true); // when lines were long, wrapping is what removed the scroll

  // Letters stay inside the viewer: M must not switch the tower behind to map view.
  const view = (await state(page)).view;
  await page.keyboard.press('m');
  expect((await state(page)).view).toBe(view);

  // Choices are remembered.
  await page.reload();
  await page.locator(`[data-card="${pick.id}"]`).click().catch(() => undefined);
  await open(page);
  await expect(page.locator('.viewer .code.wrap pre')).toBeVisible();
  await page.keyboard.press('v');
  await page.keyboard.press('w');
  await expect(page.locator('.viewer .md-view')).toBeVisible();
});
