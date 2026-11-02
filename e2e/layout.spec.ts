import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { emit, expect, openProject, pressUntil, test, ws } from './fixtures.ts';

/** HUD panels must never overlap or leave the window, at any screen size and interface size. */

const BIG = ws.projects.find((p) => p.startsWith('game-studio/'))!;
const PANELS = ['.topbar', '.layernav', '.legend', '.inspector', '.livefeed', '.controls'];

const SIZES = [
  { width: 1280, height: 720, uiScale: 1 },
  { width: 1440, height: 900, uiScale: 1 },
  { width: 1440, height: 900, uiScale: 1.3 },
  { width: 1920, height: 1080, uiScale: 1.15 },
  { width: 2560, height: 1440, uiScale: 1.6 },
  { width: 1024, height: 640, uiScale: 1 },
  { width: 720, height: 900, uiScale: 1 }, // half of a laptop screen
];

type Box = { s: string; x: number; y: number; r: number; b: number };

async function rects(page: Page, sels = PANELS): Promise<Box[]> {
  return page.evaluate((list) => list.flatMap((s) => {
    const el = document.querySelector<HTMLElement>(s);
    if (!el || !el.offsetParent) return [];
    const r = el.getBoundingClientRect();
    return [{ s, x: r.left, y: r.top, r: r.right, b: r.bottom }];
  }), sels);
}

/** Panels slide in (transform): wait until their animations are over before measuring. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity) // live pulses never finish
    .map((a) => a.finished.catch(() => undefined))));
}

/** Message when two boxes overlap by more than a pixel or two, else undefined. */
function overlap(a: Box, b: Box): string | undefined {
  const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
  const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
  if (w > 2 && h > 2) return `${a.s} overlaps ${b.s} (${Math.round(w)}x${Math.round(h)})`;
}

for (const size of SIZES) {
  test(`layout ${size.width}x${size.height} at ${size.uiScale}x`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript((uiScale) => localStorage.setItem('flow-tower:prefs', JSON.stringify({ uiScale })), size.uiScale);
    await emit('layout.panels', 'tool.start', `${size.width}x${size.height} @${size.uiScale}`);
    await openProject(page, BIG);
    await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 0);
    await pressUntil(page, 'ArrowRight', (s) => !!s.selected);
    await page.keyboard.press('f');
    await expect(page.locator('.inspector')).toBeVisible();
    await expect(page.locator('.livefeed')).toBeVisible();
    await settle(page);

    const boxes = await rects(page);
    const problems: string[] = [];
    for (const a of boxes) {
      if (a.x < -1 || a.y < -1 || a.r > size.width + 1 || a.b > size.height + 1) problems.push(`${a.s} leaves the window`);
      for (const b of boxes) {
        if (a.s >= b.s) continue;
        const o = overlap(a, b);
        if (o) problems.push(o);
      }
    }
    await emit('layout.panels', 'tool.end', `${problems.length} layout problems`, problems.length ? 'error' : 'ok');
    expect(problems).toEqual([]);
  });
}

test('accessibility of the HUD (axe, WCAG 2 A/AA, canvas excluded)', async ({ page }) => {
  await emit('layout.axe', 'tool.start', 'axe scan');
  await page.goto('/?quality=eco');
  await expect(page.locator('[data-card]').first()).toBeVisible();
  const library = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  await openProject(page, BIG);
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 0);
  await pressUntil(page, 'ArrowRight', (s) => !!s.selected);
  const hud = await new AxeBuilder({ page }).exclude('canvas').withTags(['wcag2a', 'wcag2aa']).analyze();
  await page.keyboard.press(',');
  await expect(page.locator('.settings')).toBeVisible();
  // Wait for the overlay's fade and the panel's zoom-in; axe measures contrast at partial opacity otherwise.
  // Infinite animations (HUD pulses) are skipped so they cannot hang the wait.
  await page.locator('.settings').evaluate(async (el) => {
    const root = el.closest('.overlay') ?? el;
    const finite = root.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished));
  });
  const settings = await new AxeBuilder({ page }).include('.settings').withTags(['wcag2a', 'wcag2aa']).analyze();
  const summary = [
    ...library.violations.map((v) => ({ ...v, where: 'library' })),
    ...hud.violations.map((v) => ({ ...v, where: 'tower' })),
    ...settings.violations.map((v) => ({ ...v, where: 'settings' })),
  ]
    .map((v) => `${v.where}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  await test.info().attach('axe.json', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  await emit('layout.axe', 'tool.end', `${summary.length} axe rules violated`, summary.length ? 'error' : 'ok');
  expect(summary).toEqual([]);
});

test('phone layout 390x844: one panel at a time', async ({ page }) => {
  const width = 390;
  const height = 844;
  await page.setViewportSize({ width, height });
  await emit('layout.panels', 'tool.start', `${width}x${height} phone sheets`);
  await openProject(page, BIG);

  // With no sheet open, only the tab bar and the controls show; the side panels are hidden.
  for (const sel of ['.layernav', '.legend', '.towerinfo']) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('.phone-tabs')).toBeVisible();

  // Hidden overflow scrolls inside the bar, so the bar itself is measured, not its buttons.
  const [bar] = await rects(page, ['.controls']);
  const problems: string[] = [];
  if (bar.x < -1 || bar.r > width + 1) problems.push('.controls leaves the window');

  const sheets: [string, string][] = [['Layers', '.layernav'], ['Info', '.towerinfo'], ['Legend', '.legend']];
  for (const [tab, sel] of sheets) {
    await page.locator('.phone-tabs button', { hasText: tab }).click();
    await expect(page.locator(sel)).toBeVisible();
    await settle(page);
    const [panel, ...others] = await rects(page, [sel, '.topbar', '.phone-tabs', '.controls']);
    if (panel.s !== sel) problems.push(`${sel} is not visible under ${tab}`);
    if (panel.x < -1 || panel.y < -1 || panel.r > width + 1 || panel.b > height + 1) problems.push(`${sel} leaves the window`);
    for (const other of others) {
      const o = overlap(panel, other);
      if (o) problems.push(o);
    }
  }

  // Picking a layer closes the sheet so the tower shows again.
  await page.locator('.phone-tabs button', { hasText: 'Layers' }).click();
  await page.locator('.layernav button').filter({ hasNotText: 'Tower overview' }).first().click();
  await expect(page.locator('.layernav')).toBeHidden();

  // Selecting a node shows the inspector full width and no sheet.
  await pressUntil(page, 'ArrowRight', (s) => !!s.selected);
  await page.keyboard.press('f');
  await expect(page.locator('.inspector')).toBeVisible();
  await settle(page);
  const [insp] = await rects(page, ['.inspector']);
  if (insp.x < -1 || insp.y < -1 || insp.r > width + 1 || insp.b > height + 1) problems.push('.inspector leaves the window');
  for (const sel of ['.layernav', '.legend', '.towerinfo', '.nodelist']) await expect(page.locator(sel)).toBeHidden();

  await emit('layout.panels', 'tool.end', `${problems.length} phone layout problems`, problems.length ? 'error' : 'ok');
  expect(problems).toEqual([]);
});
