import { mkdirSync, statSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openProject, test, ws } from './fixtures.ts';

/**
 * The document view (?doc=…&level=N) is what the PDF menu prints: its HTML must hold every node, its
 * anchors must resolve, and page.pdf must produce real files at each level.
 */

const PDF_DIR = 'test-results/pdf';
const TOWERS = ['dev-squad', 'game-studio'];

interface Ws { towers: Record<string, { name: string; layers: { title: string; nodes: { label: string }[] }[] }>; projects: string[] }

/** The workspace the dev server serves: the test reads it, so the expectations follow the examples. */
async function workspace(page: Page): Promise<Ws> {
  const res = await page.request.get('/api/workspace');
  expect(res.ok()).toBe(true);
  return (await res.json()) as Ws;
}

test('the document view shows every node of the root tower, with anchors and a diagram per layer', async ({ page }) => {
  const root = (await workspace(page)).towers['dev-squad'];
  await page.goto('/?doc=dev-squad&level=2');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });

  const text = await page.locator('main').innerText();
  for (const layer of root.layers) {
    for (const node of layer.nodes) expect(text, `node "${node.label}" on the page`).toContain(node.label);
  }

  // Every in-page link must point at an id that exists, or the printed PDF has dead references.
  const hrefs = await page.locator('a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  for (const href of hrefs) {
    const id = decodeURIComponent(href.slice(1));
    expect(await page.locator(`[id="${id}"]`).count(), `anchor ${href} has a target`).toBeGreaterThan(0);
  }

  expect(await page.locator('main svg').count(), 'inline diagram per layer').toBeGreaterThanOrEqual(root.layers.length);
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/doc-level2.png', fullPage: true });
});

test('the document prints to PDF at each level, and the full one is larger', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'page.pdf works in Chromium only');
  test.setTimeout(240_000);
  mkdirSync(PDF_DIR, { recursive: true });

  for (const tower of TOWERS) {
    const sizes: Record<number, number> = {};
    for (const level of [1, 2, 3]) {
      await page.goto(`/?doc=${tower}&level=${level}`);
      await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
      await page.emulateMedia({ media: 'print' });
      const path = `${PDF_DIR}/${tower}-level${level}.pdf`;
      await page.pdf({ path, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
      sizes[level] = statSync(path).size;
      expect(sizes[level], `${path} is a real document`).toBeGreaterThan(10 * 1024);
      await page.emulateMedia({ media: 'screen' });
    }
    expect(sizes[3], `${tower}: level 3 is larger than level 2`).toBeGreaterThan(sizes[2]);
  }
});

test('the PDF button opens the menu, and Overview opens the document in a new page', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the PDF menu is checked in Chromium only');
  // Stop the print dialog: the new page would otherwise call window.print once it is ready.
  await page.context().addInitScript(() => { window.print = () => {}; });
  const id = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
  await openProject(page, id);

  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Documentation as PDF' });
  await expect(menu).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    menu.getByRole('button', { name: /^Overview/ }).click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  const url = new URL(popup.url());
  expect(url.searchParams.get('doc')).toBeTruthy();
  expect(url.searchParams.get('level')).toBe('2');
  await expect(menu).toHaveCount(0);
});
