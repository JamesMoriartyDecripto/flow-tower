import type { Page } from '@playwright/test';
import { expect, openProject, pressUntil, test, ws } from './fixtures.ts';

/**
 * The Hub panel (#92), driven from the keyboard like the rest of the HUD. The hub's own read routes are
 * answered by interception, so a machine list and a read-only viewer can be shown without a real hub,
 * and the Now tab is fed through /api/events the way live.spec.ts does. Metadata only: the panel must
 * never show a `message`, so the Now test posts distinctive ones and checks they are nowhere on screen.
 */

const DEV = ws.projects.find((p) => p.startsWith('dev-squad/'))!;

/** The camera through react-three-fiber's live state, like camera.spec.ts: opening the panel must not pan it. */
const camera = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as { __flowTower: { three: { get(): { controls: { distance: number; getTarget(v: object): { x: number } } } } } })
    .__flowTower.three.get().controls;
  return { distance: c.distance, x: c.getTarget({ x: 0, y: 0, z: 0 }).x };
});

/**
 * Reads the camera until three consecutive reads agree: the tower's opening animation eases it into place
 * over a second or so, so two equal reads 250 ms apart can still be a slow frame of that animation.
 */
async function settledCamera(page: Page) {
  let prev = await camera(page);
  for (let stable = 0, i = 0; i < 32; i++) {
    await page.waitForTimeout(250);
    const next = await camera(page);
    stable = Math.abs(next.distance - prev.distance) < 0.01 && Math.abs(next.x - prev.x) < 0.01 ? stable + 1 : 0;
    prev = next;
    if (stable >= 2) return next;
  }
  return prev;
}

/** One row of GET /api/hub/machines, as src/server/machines.ts shapes it. */
interface Machine {
  sender: string;
  token: string;
  runtime?: string;
  host?: string;
  lastSeen?: number;
  queued?: number;
  state: 'active' | 'paused' | 'revoked' | 'unknown';
  online: boolean;
}

/** The two rows the Machines tests start from: one healthy and online, one revoked long ago. */
const MACHINES: Machine[] = [
  { sender: 'ana-mbp', token: 'ft_ab12…', runtime: 'claude-code', host: 'ana-mbp', lastSeen: Date.now(), queued: 0, state: 'active', online: true },
  { sender: 'old-ci', token: 'ft_cd34…', runtime: 'cron', host: 'ci-1', state: 'revoked', online: false },
];

test('now: one row per machine, runtime and starter, and no message anywhere', async ({ page }) => {
  const tag = `hub-${Date.now()}`;
  // The project tag is unique to this test: the other specs push events into the same dev server, so the
  // rows are found by this tag instead of counting whatever else the shared live store happens to hold.
  const project = `proj-${tag}`;
  const events = [
    { kind: 'tool.start', host: `ana-mbp-${tag}`, runtime: 'claude-code', project, user: 'zoe', message: `msg-a-${tag}` },
    { kind: 'tool.start', host: `bob-mbp-${tag}`, runtime: 'codex', project, message: `msg-b-${tag}` },
    // A scheduled runtime acts on its own: it must read AUTO even though it carries no user either.
    { kind: 'tool.start', host: `ci-${tag}`, runtime: 'cron', project, message: `msg-c-${tag}` },
  ];

  await openProject(page, DEV);
  for (const e of events) {
    const res = await page.request.post('/api/events', { data: e });
    // Claude Code hooks read a JSON body as a decision: the endpoint must stay 204 with no body.
    expect(res.status()).toBe(204);
    expect(await res.text()).toBe('');
  }

  await page.keyboard.press('h');
  const panel = page.locator('.hub');
  await expect(panel).toBeVisible();

  const rows = panel.locator('.hub-rows .hub-row:not(.head)').filter({ hasText: project });
  await expect(rows).toHaveCount(3);
  // The user-less event and the cron one both read AUTO; only the first row names who started the run.
  await expect(rows.locator('.hub-auto')).toHaveCount(2);
  await expect(rows.filter({ hasText: `ana-mbp-${tag}` })).toContainText('zoe');
  // Metadata only: a row is identity plus a count, so a `message` can never reach the panel.
  for (const e of events) await expect(panel).not.toContainText(e.message);

  await page.screenshot({ path: 'test-results/hub-now.png' });
});

test('machines: senders, dots and shortened token labels', async ({ page }) => {
  await page.route('**/api/hub/machines', (r) => r.fulfill({ json: MACHINES }));
  await openProject(page, DEV);
  // The panel opens on Now; `]` cycles the tabs through the window event App.tsx dispatches. The tab
  // listener is attached by an effect, so the panel must exist before the key is sent.
  await page.keyboard.press('h');
  await expect(page.locator('.hub')).toBeVisible();
  await page.keyboard.press(']');
  const table = page.locator('.hub-rows.machines');
  await expect(table.locator('.hub-row:not(.head)')).toHaveCount(2);
  await expect(table).toContainText('ana-mbp');
  await expect(table).toContainText('claude-code');
  await expect(table).toContainText('old-ci');
  // An online row is active (●), a revoked one is off whatever its clock says (✕).
  await expect(table).toContainText('●');
  await expect(table).toContainText('✕');
  // The token is a label only: its id tells the rows apart, the secret itself never reaches the UI.
  await expect(table).toContainText('ft_ab12…');
  await expect(table).toContainText('ft_cd34…');

  await page.screenshot({ path: 'test-results/hub-machines.png' });
});

test('machines: a later poll failing keeps the rows and warns', async ({ page, errors }) => {
  await page.route('**/api/hub/machines', (r) => r.fulfill({ json: MACHINES }));
  await openProject(page, DEV);
  await page.keyboard.press('h');
  await expect(page.locator('.hub')).toBeVisible();
  await page.keyboard.press(']');
  const rows = page.locator('.hub-rows.machines .hub-row:not(.head)');
  await expect(rows).toHaveCount(2);

  // The hub went away: the panel keeps the last good list, so a blank table never reads as "no senders".
  // A later route wins over the first, which is how the next poll gets a 500 instead.
  await page.route('**/api/hub/machines', (r) => r.fulfill({ status: 500, json: { error: 'unavailable' } }));
  // The panel polls every 10 s and `page.clock` would freeze the WebGL frame driver, so wait the poll out.
  await expect(page.locator('.hub-warn')).toHaveText('Machines unavailable', { timeout: 15_000 });
  await expect(rows).toHaveCount(2);
  await expect(rows).toContainText('ana-mbp');
  // Close the panel first, so no further poll can be provoked while we wait for this one's console error.
  await page.keyboard.press('Escape');
  await expect(page.locator('.hub')).toHaveCount(0);
  // Chromium reports the 500 asynchronously, after the warning above is on screen, so wait for it to land
  // rather than reading `errors` while it is still in flight.
  await expect.poll(() => errors.some((e) => /status of 500/.test(e))).toBe(true);
  // That 500 is the failure under test: assert it is the only noise and clear it, leaving the fixture
  // strict about everything else.
  const provoked = errors.filter((e) => /Failed to load resource|hub\/machines/.test(e));
  expect(errors.filter((e) => !provoked.includes(e)), 'console and page errors other than the provoked 500').toEqual([]);
  errors.length = 0;
});

test('hub chip: a read-only viewer sees the counters, a plain server shows no chip', async ({ page }) => {
  await page.route('**/api/hub/me', (r) => r.fulfill({ json: { hub: true, readOnly: true, online: 1, tokens: 2 } }));
  // The pill opens the senders list: answer that route too, so the screenshot shows a known table.
  await page.route('**/api/hub/machines', (r) => r.fulfill({ json: MACHINES }));
  await openProject(page, DEV);
  await expect(page.locator('.topbar .hub-chip')).toHaveText('HUB 1/2');
  await expect(page.locator('.topbar .hub-ro')).toHaveText('READ-ONLY');

  // The pill is the way into the senders list: clicking it opens the panel on Machines.
  await page.locator('.topbar .hub-chip').click();
  await expect(page.locator('.hub')).toBeVisible();
  await expect(page.locator('#hub-tab-machines')).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/hub-readonly.png' });

  // Not on a hub: no HUB chip at all, rather than a pill counting zero senders. Wait for the answer, so
  // the count is checked after the pill's only poller was told `hub: false`.
  await page.unroute('**/api/hub/me');
  await page.route('**/api/hub/me', (r) => r.fulfill({ json: { hub: false, readOnly: false, online: 0, tokens: 0 } }));
  const answered = page.waitForResponse('**/api/hub/me');
  await page.reload();
  await answered;
  await expect(page.locator('.topbar .hub-chip')).toHaveCount(0);
});

test('keyboard: ArrowRight moves the Hub tabs and leaves the camera alone', async ({ page }) => {
  await openProject(page, DEV);
  await page.keyboard.press('h');
  await expect(page.locator('.hub')).toBeVisible();
  await page.locator('#hub-tab-now').focus();
  const before = await settledCamera(page);

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#hub-tab-machines')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hub-tab-machines')).toBeFocused(); // focus follows the selection
  // The tablist stops the event, so the scene must not answer it by moving the tower's camera.
  const after = await settledCamera(page);
  expect(Math.abs(after.distance - before.distance), 'camera distance').toBeLessThan(0.5);
  expect(Math.abs(after.x - before.x), 'camera target').toBeLessThan(1);
});

test('Escape closes the Hub panel and the right panel comes back', async ({ page }) => {
  await openProject(page, DEV);
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 0);
  await expect(page.locator('.nodelist')).toBeVisible();

  await page.keyboard.press('h');
  await expect(page.locator('.hub')).toBeVisible();
  // The Hub takes the Inspector's place: the node list would fight it for the right edge.
  await expect(page.locator('.nodelist')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('.hub')).toHaveCount(0);
  await expect(page.locator('.nodelist')).toBeVisible();
});
