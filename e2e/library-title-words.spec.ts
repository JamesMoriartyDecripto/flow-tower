import type { Page } from '@playwright/test';
import { expect, state, test, type Workspace } from './fixtures.ts';

/**
 * Library card titles (#279): the chips sit in their own row under the title, so a title keeps the card's
 * width and its words are not split mid-word. Every card carries a machine chip and an "updated" chip (a
 * hub sends `sharedAt` for each shared project), so the chip row is at its fullest here.
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

/** Tags the real workspace with sources and a recent `sharedAt` for every non-local project. */
async function injectSources(page: Page, rename?: string) {
  await page.route('**/api/workspace', async (route) => {
    const res = await route.fetch();
    const ws = (await res.json()) as Workspace;
    const [first, second, third, ...rest] = ws.projects;
    if (rename) ws.towers[first].name = rename;
    ws.sources = {
      [first]: 'local',
      [second]: 'mac-ana',
      [third]: 'mac-ana',
      ...Object.fromEntries(rest.map((p) => [p, 'fedora-box'])),
    };
    const recent = Date.now() - 5 * 60_000;
    ws.sharedAt = Object.fromEntries(ws.projects.filter((p) => ws.sources![p] !== 'local').map((p) => [p, recent]));
    await route.fulfill({ response: res, json: ws });
  });
  await page.route('**/api/hub/satellites', (route) => route.fulfill({
    json: [
      { sender: 'mac-ana', online: true, queued: 0, dropped: 0, state: 'ok', lastSeen: Date.now(), host: 'mac-ana', runtime: 'claude', version: '1.0.0' },
      { sender: 'fedora-box', online: false, queued: 0, dropped: 0, state: 'ok', lastSeen: Date.now() - 3_600_000, host: 'fedora-box', runtime: 'codex', version: '1.0.0' },
    ],
  }));
}

for (const width of [1280, 1440, 1920]) {
  test(`at ${width} px no title word is split and the chips sit below the title`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await injectSources(page);
    await openLibrary(page);

    // Every card has a machine chip and an updated chip, so the chip row is present on each card.
    const cards = await page.locator('[data-card]').count();
    await expect(page.locator('[data-card] .lib-chips .lib-source')).toHaveCount(cards);
    // Only shared projects carry an updated chip. injectSources makes the first project local (this hub's own),
    // and a local project has no shared time, so exactly one card is expected to lack it.
    await expect(page.locator('[data-card] .lib-chips .lib-shared')).toHaveCount(cards - 1);

    // A word is whole when its DOM Range has exactly one client rect (a split word has one per line).
    const split = await page.$$eval('.lib-name', (names) => {
      const out = [];
      for (const name of names) {
        const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          const re = /\S+/g;
          let m;
          while ((m = re.exec(text))) {
            const range = document.createRange();
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            if (range.getClientRects().length !== 1) out.push(m[0]);
          }
        }
      }
      return out;
    });
    expect(split).toEqual([]);

    // Each card's chip row starts at or below the bottom of its title.
    const below = await page.$$eval('[data-card]', (cardEls) => cardEls.map((card) => {
      const name = card.querySelector('.lib-name')?.getBoundingClientRect();
      const chips = card.querySelector('.lib-chips')?.getBoundingClientRect();
      return { id: card.getAttribute('data-card'), nameBottom: name?.bottom ?? 0, chipsTop: chips?.top ?? 0 };
    }));
    for (const c of below) expect(c.chipsTop, c.id ?? '').toBeGreaterThanOrEqual(c.nameBottom - 1);
  });
}

test('a one-word name wider than the card stays inside it and wraps', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // One long token with no spaces: the case that used to widen the title button past the card.
  const long = 'claude_code_dev_squad_pipeline';
  await injectSources(page, long);
  await openLibrary(page);

  const card = page.locator('[data-card]').filter({ has: page.locator('.lib-name', { hasText: long }) });
  await expect(card).toHaveCount(1);
  const m = await card.evaluate((el) => {
    const name = el.querySelector('.lib-name') as HTMLElement;
    const body = el.querySelector('.lib-body') as HTMLElement;
    return {
      nameRight: name.getBoundingClientRect().right,
      bodyRight: body.getBoundingClientRect().right,
      nameHeight: name.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(name).lineHeight),
    };
  });
  expect(m.nameRight).toBeLessThanOrEqual(m.bodyRight + 1);
  expect(m.nameHeight).toBeGreaterThan(m.lineHeight * 1.5);
});
