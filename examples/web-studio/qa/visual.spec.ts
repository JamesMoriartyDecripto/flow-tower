import { test, expect } from '@playwright/test';

/**
 * Visual regression against baselines approved at the last client sign-off. Baselines are
 * updated only by the studio lead (`npx playwright test --update-snapshots`) after a round
 * closes, never by an agent fixing a failing diff.
 */
const TEMPLATES = {
  home: '/',
  listing: '/shop',
  product: '/shop/ethiopia-guji-hambela',
  landing: '/wholesale',
  article: '/journal/v60-brew-guide',
  content: '/about',
};

for (const [name, path] of Object.entries(TEMPLATES)) {
  test(`template ${name} matches the approved baseline`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    // Dynamic content (stock badge, journal dates) is masked, not hidden, so layout stays real.
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      mask: [page.locator('[data-dynamic]')],
    });
  });
}
