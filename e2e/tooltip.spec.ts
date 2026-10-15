import { expect, openProject, test, type Workspace, ws } from './fixtures.ts';

// Dev-only hook from src/app/mountApp.tsx, declared once here so the evaluate callback can stay plain JavaScript.
declare global {
  interface Window {
    __flowTower: { store: { getState(): { focusLayer(i: number): void } } };
  }
}

const ID = ws.projects.find((p) => p.startsWith('voice-commands/'))!;

/**
 * The HUD tooltip of a long node description in the right node list must stay inside the window: it used to
 * run off the bottom and get squeezed into a narrow column at the right edge.
 */
test.use({ viewport: { width: 1440, height: 800 } });

test('tooltip: a long node description stays inside the window', async ({ page }) => {
  // The shipped description is short now (validate caps it), so the long text is injected here: the tooltip
  // must still be checked against a description that actually overflows.
  await page.route('**/api/workspace', async (route) => {
    const res = await route.fetch();
    const ws = (await res.json()) as Workspace;
    const node = ws.towers[ID].layers[3].nodes.find((n) => n.label === 'Spoken reply')!;
    node.description = 'A long node description that must stay inside the window. '.repeat(20);
    await route.fulfill({ response: res, json: ws });
  });
  await openProject(page, ID);
  // Focusing a layer opens its node list on the right, the same way the keyboard does.
  await page.evaluate(() => window.__flowTower.store.getState().focusLayer(3));
  const row = page.locator('.nodelist button, .nodelist [title]').filter({ hasText: 'Spoken reply' }).first();
  await row.hover();
  const tip = page.locator('.hud-tip');
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  expect(box).not.toBeNull();
  const b = box!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(800);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(1440);
  expect(b.width).toBeGreaterThanOrEqual(300);
});
