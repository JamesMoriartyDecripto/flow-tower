import type { Page } from '@playwright/test';
import { expect, state, test, type Workspace } from './fixtures.ts';

/**
 * Library sources (#165): a hub lists which machine each project came from (`workspace.sources`), the
 * source chip on every card, and a row of source chips that filters the gallery and keeps the choice in
 * the URL. The dev server here has no machines, so `sources` and the satellites list are injected the way
 * a hub serve would send them: the first project is this hub's own, the next two come from mac-ana and
 * the rest from fedora-box. The satellite answer is the shape src/server/satellites.ts lists.
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

/** Tags the real workspace with sources and answers the satellites list: mac-ana online, fedora-box offline. */
async function injectSources(page: Page) {
  await page.route('**/api/workspace', async (route) => {
    const res = await route.fetch();
    const ws = (await res.json()) as Workspace;
    const [first, second, third, ...rest] = ws.projects;
    ws.sources = {
      [first]: 'local',
      [second]: 'mac-ana',
      [third]: 'mac-ana',
      ...Object.fromEntries(rest.map((p) => [p, 'fedora-box'])),
    };
    await route.fulfill({ response: res, json: ws });
  });
  await page.route('**/api/hub/satellites', (route) => route.fulfill({
    json: [
      { sender: 'mac-ana', online: true, queued: 0, dropped: 0, state: 'ok', lastSeen: Date.now(), host: 'mac-ana', runtime: 'claude', version: '1.0.0' },
      { sender: 'fedora-box', online: false, queued: 0, dropped: 0, state: 'ok', lastSeen: Date.now() - 3_600_000, host: 'fedora-box', runtime: 'codex', version: '1.0.0' },
    ],
  }));
}

test('each card names its source; the row filters by machine and the URL keeps it', async ({ page }) => {
  await injectSources(page);
  await openLibrary(page);

  // Every card carries a source chip, and the row lists ALL, THIS HUB, FEDORA-BOX and MAC-ANA with counts.
  const cards = await page.locator('[data-card]').count();
  await expect(page.locator('[data-card] .chip.lib-source')).toHaveCount(cards);
  const row = page.locator('.lib-sources');
  await expect(row.locator('button').nth(0)).toHaveText('ALL');
  await expect(row.locator('button').nth(1)).toContainText('THIS HUB');
  await expect(row.locator('button').nth(1)).toContainText('1');
  await expect(row.locator('button', { hasText: 'FEDORA-BOX' })).toContainText(String(cards - 3));
  await expect(row.locator('button', { hasText: 'MAC-ANA' })).toContainText('2');

  // The online dot is on MAC-ANA only: mac-ana answered online, fedora-box did not.
  await expect(row.locator('.lib-online')).toHaveCount(1);
  await expect(row.locator('button', { hasText: 'MAC-ANA' }).locator('.lib-online')).toHaveCount(1);
  await expect(row.locator('button', { hasText: 'FEDORA-BOX' }).locator('.lib-online')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/library-sources.png' });

  // Clicking MAC-ANA leaves its two cards and puts the source in the URL.
  await row.locator('button', { hasText: 'MAC-ANA' }).click();
  await expect(page.locator('[data-card]')).toHaveCount(2);
  await expect(page.locator('[data-card] .chip.lib-source', { hasText: 'MAC-ANA' })).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get('source')).toBe('mac-ana');

  await page.screenshot({ path: 'test-results/library-sources-mac.png' });

  // Reloading the URL keeps the filter: the choice is read from the link on load.
  await page.reload();
  if (!(await state(page)).library) await page.keyboard.press('l');
  await expect(page.locator('[data-card]')).toHaveCount(2);
  await expect(row.locator('button', { hasText: 'MAC-ANA' })).toHaveClass(/\bon\b/);
});

test('without sources no source chip or row appears', async ({ page }) => {
  // The plain dev server sends no `sources`: the cards and the header stay as they were before #165.
  await openLibrary(page);
  await expect(page.locator('[data-card]').first()).toBeVisible();
  await expect(page.locator('.lib-source')).toHaveCount(0);
  await expect(page.locator('.lib-sources')).toHaveCount(0);
});
