import type { Page } from '@playwright/test';
import { expect, openProject, state, test, tower, ws } from './fixtures.ts';

/**
 * Remote activity (#95): a tower fed by two machines. Each running node names its host, so the live
 * chips show `@host` and the library card lists the machines that ran the project in the last 15 minutes.
 */

/** Opens the Library and waits for its cards, the same way library-origin.spec.ts does. */
async function openLibrary(page: Page) {
  await page.goto('/?quality=eco');
  // The filter box takes focus as soon as the library opens, so open it with L only when it is still closed.
  if (!(await state(page)).library) await page.keyboard.press('l');
  await expect(page.locator('.lib-grid')).toBeVisible();
  await expect(page.locator('[data-card]').first()).toBeVisible();
}

test('remote activity: chips and library cards name the machines (#95)', async ({ page }) => {
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  const t = tower(id);
  const first = t.layers[1].nodes[0];
  const second = t.layers[2].nodes[0];
  await openProject(page, id);

  // A unique source per test run keeps these events apart from earlier runs on the same server.
  const tag = `e2e-remote-${Date.now()}`;
  const post = (body: object) => page.request.post('/api/events', { data: body });
  // No tool.end yet: both runs stay open so the chips and the library have something to show.
  for (const [node, host] of [[first, 'alpha'], [second, 'beta']] as const) {
    const res = await post({ kind: 'tool.start', source: `${tag}-${host}`, node: node.key, tower: t.id, tool: 'Bash', host, call: `${tag}-${host}` });
    expect(res.status()).toBe(204);
  }

  // Chips only show while the live feed is open.
  await page.keyboard.press('f');
  await expect(page.locator('.livefeed')).toBeVisible();
  await expect(page.locator('.live-chip', { hasText: '@alpha' }).first()).toBeVisible();
  await expect(page.locator('.live-chip', { hasText: '@beta' }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/remote-activity-tower.png' });

  await openLibrary(page);
  const card = page.locator(`[data-card="${id}"]`);
  await expect(card.locator('.lib-hosts')).toContainText('@alpha');
  await expect(card.locator('.lib-hosts')).toContainText('@beta');
  await page.screenshot({ path: 'test-results/remote-activity-library.png' });

  // Close both runs so later specs do not see running nodes.
  for (const host of ['alpha', 'beta']) {
    await post({ kind: 'tool.end', source: `${tag}-${host}`, tower: t.id, status: 'ok', call: `${tag}-${host}` });
  }
});
