import type { Page } from '@playwright/test';
import { expect, state, test } from './fixtures.ts';

/**
 * Library card titles (#211a): a project name wraps on word boundaries, capped at 3 lines, instead of being
 * cut to one line with an ellipsis. These cases pin that no name is clipped at the common widths, and that a
 * long name really takes more than one line rather than being squeezed into one.
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

for (const width of [1920, 1440, 390]) {
  test(`at ${width}px no library name is cut`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openLibrary(page);

    // A name is cut when its content is larger than its box; the 1px slack absorbs subpixel rounding.
    // The cut names are collected first so the failure message says which ones and at which width.
    const cut = await page.$$eval('.lib-name', (els) =>
      els
        .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent ?? ''),
    );
    expect(cut, `names cut at ${width}px`).toEqual([]);
  });
}

test('at 1440px the Sales Pipeline name wraps onto more than one line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLibrary(page);

  const name = page.locator('.lib-name', { hasText: /^Sales Pipeline/ }).first();
  await expect(name).toBeVisible();
  // One line is about 1.2 × 20px = 24px; two lines are about 48px. Anything above 1.5 × line-height means
  // the name spans more than one line, so it is wrapped rather than clipped.
  const { height, lineHeight } = await name.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height, `Sales Pipeline name height vs line-height ${lineHeight}`).toBeGreaterThan(1.5 * lineHeight);
});
