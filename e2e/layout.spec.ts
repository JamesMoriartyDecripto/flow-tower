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
];

async function rects(page: Page) {
  return page.evaluate((sel) => sel.flatMap((s) => {
    const el = document.querySelector<HTMLElement>(s);
    if (!el || !el.offsetParent) return [];
    const r = el.getBoundingClientRect();
    return [{ s, x: r.left, y: r.top, r: r.right, b: r.bottom }];
  }), PANELS);
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
    await page.waitForTimeout(400); // panel transitions

    const boxes = await rects(page);
    const problems: string[] = [];
    for (const a of boxes) {
      if (a.x < -1 || a.y < -1 || a.r > size.width + 1 || a.b > size.height + 1) problems.push(`${a.s} leaves the window`);
      for (const b of boxes) {
        if (a.s >= b.s) continue;
        const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
        const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
        if (w > 2 && h > 2) problems.push(`${a.s} overlaps ${b.s} (${Math.round(w)}x${Math.round(h)})`);
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
  const summary = [...library.violations.map((v) => ({ ...v, where: 'library' })), ...hud.violations.map((v) => ({ ...v, where: 'tower' }))]
    .map((v) => `${v.where}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  await test.info().attach('axe.json', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  await emit('layout.axe', 'tool.end', `${summary.length} axe rules violated`, summary.length ? 'error' : 'ok');
  expect(summary).toEqual([]);
});
