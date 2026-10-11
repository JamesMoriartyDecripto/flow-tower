import type { Page } from '@playwright/test';
import { expect, openProject, test, tower, ws } from './fixtures.ts';

/**
 * KaTeX 0.16 → 0.18 prefixed its CSS classes (`katex-…` → `.katex .katex-…`), so a selector on an
 * internal class would break on a bump while the math was fine. Prove rendering the way a reader sees
 * it: the MathML KaTeX always emits (`math` elements) is there, and no parse error is on screen.
 */

// The study-notes example: its kinematics chapter is the one full of `$$…$$` blocks.
const ID = ws.projects.find((p) => p.startsWith('physics-notes/'));
if (!ID) throw new Error('no physics-notes project in the library');

const MATH_FILE = 'notes/02-kinematics.md';
// Find the node that references the math note, rather than hard-coding an id from the YAML.
const pick = (() => {
  for (const n of tower(ID).layers.flatMap((l) => l.nodes)) {
    const index = n.files.indexOf(MATH_FILE);
    if (index >= 0) return { id: ID, files: n.files, index };
  }
  throw new Error(`no node references ${MATH_FILE}`);
})();

const open = (page: Page) => page.evaluate((f) => (window as unknown as { __flowTower: { store: { getState(): { openFile(x: object): void } } } })
  .__flowTower.store.getState().openFile({ tower: f.id, files: f.files, index: f.index }), pick);

test('math: KaTeX still renders after the bump', async ({ page }) => {
  await openProject(page, ID);
  await open(page);
  // Markdown opens formatted (V switches to source), so KaTeX runs.
  const view = page.locator('.viewer .md-view');
  await expect(view).toBeVisible();

  // KaTeX emits MathML next to its HTML, so `math` elements survive any class renaming.
  await expect(view.locator('math').first()).toBeVisible();
  expect(await view.locator('math').count(), 'several formulas rendered').toBeGreaterThan(1);

  // On a parse failure KaTeX prints a visible error instead of the formula: catch it by text and title.
  await expect(view.locator('text=ParseError')).toHaveCount(0);
  await expect(view.locator('[title^="ParseError"]')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/math.png' });
});
