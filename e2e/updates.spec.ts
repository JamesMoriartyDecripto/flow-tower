import { expect, openProject, test, ws } from './fixtures.ts';

/**
 * Settings › Updates (#141): what a user sees from opening Settings to a forced check. The server's daily
 * check and the forced check are both answered by route interception, so no GitHub call leaves the machine:
 * `/api/version` is the quiet daily read, `/api/version/check` is what `Check for updates` hits, answered
 * here in order (a release, the same answer throttled, then an offline failure).
 */
const DEV = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
const COMMAND = 'cd /x && git pull && npm install';

test('updates: daily check, a forced check, the throttle and an offline answer', async ({ page }) => {
  // The daily check the server already ran: up to date, with the local update command for the copy button.
  await page.route('**/api/version', (r) => r.fulfill({
    json: { current: '0.6.0', latest: 'v0.6.0', url: 'https://example.com/r', newer: false, checkedAt: Date.now() - 3_600_000, command: COMMAND },
  }));
  const answers = [
    { current: '0.6.0', latest: 'v0.7.0', url: 'https://example.com/r7', newer: true, checkedAt: Date.now(), command: COMMAND },
    { current: '0.6.0', latest: 'v0.7.0', url: 'https://example.com/r7', newer: true, checkedAt: Date.now(), command: COMMAND, throttled: true },
    { current: '0.6.0', newer: false, error: 'offline' },
  ];
  let calls = 0;
  await page.route('**/api/version/check', (r) => r.fulfill({ json: answers[Math.min(calls++, answers.length - 1)] }));

  await openProject(page, DEV);
  await page.keyboard.press(',');
  const updates = page.locator('#settings-updates');
  await expect(updates).toBeVisible();
  await expect(updates.locator('h3')).toHaveText('Updates');
  // The quiet daily read: the installed version, up to date, and the two local-only rows.
  await expect(updates).toContainText('Installed');
  await expect(updates).toContainText('v0.6.0');
  await expect(updates).toContainText('Up to date');
  await expect(updates.locator('.updates-cmd code')).toHaveText(COMMAND);
  await expect(updates.getByRole('button', { name: 'Copy' })).toBeVisible();

  // First press: GitHub answers a newer release, with the link to its notes.
  await updates.getByRole('button', { name: 'Check for updates' }).click();
  await expect(updates).toContainText('v0.7.0 available');
  await expect(updates.getByRole('link', { name: 'Release notes' })).toHaveAttribute('href', 'https://example.com/r7');

  // Second press inside the throttle window: the last answer is replayed, and the UI says so.
  await updates.getByRole('button', { name: 'Check for updates' }).click();
  await expect(updates).toContainText('checked less than a minute ago');
  expect(calls).toBe(2);

  // Third press: GitHub is unreachable, and the status says why instead of a stale "up to date".
  await updates.getByRole('button', { name: 'Check for updates' }).click();
  await expect(updates).toContainText('Could not reach GitHub');
  expect(calls).toBe(3);

  await page.screenshot({ path: 'test-results/updates.png' });
});
