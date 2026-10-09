import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/shop', '/shop/ethiopia-guji-hambela', '/subscriptions', '/wholesale', '/journal', '/contact'];

// WCAG 2.0, 2.1 and 2.2 level A + AA rules. Target: zero violations on every template.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const path of PAGES) {
  test(`no axe violations on ${path}`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.getByRole('button', { name: /accept|akzeptieren|accepter/i }).click({ timeout: 3000 }).catch(() => {});
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    await testInfo.attach('axe-results', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
    expect(results.violations).toEqual([]);
  });
}

test('mobile menu is reachable and closable by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
});
