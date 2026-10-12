import { mkdirSync, readFileSync, statSync } from 'node:fs';
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

/** Workspace ids are file paths (`dev-squad/dev-squad.tower.yaml`), so a tower is found by its folder prefix. */
function towerIdFor(ws: Ws, folder: string): string {
  const id = Object.keys(ws.towers).find((k) => k.startsWith(`${folder}/`));
  expect(id, `a tower under ${folder}/`).toBeDefined();
  return id!;
}

/** Counts the page objects in a PDF file (`/Type /Page`, not `/Type /Pages`). */
function pageCount(path: string): number {
  return [...readFileSync(path).toString('latin1').matchAll(/\/Type\s*\/Page[^s]/g)].length;
}

/** Every in-page link must point at an id that exists, or the printed PDF has dead references. */
async function expectNoDeadLinks(page: Page): Promise<void> {
  const hrefs = await page.locator('a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  for (const href of hrefs) {
    const id = decodeURIComponent(href.slice(1));
    expect(await page.locator(`[id="${id}"]`).count(), `anchor ${href} has a target`).toBeGreaterThan(0);
  }
}

test('the document view shows every node of the root tower, with anchors and a diagram per layer', async ({ page }) => {
  const all = await workspace(page);
  const root = all.towers[towerIdFor(all, 'dev-squad')];
  await page.goto('/?doc=dev-squad&level=2');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });

  const text = await page.locator('main').innerText();
  for (const layer of root.layers) {
    for (const node of layer.nodes) expect(text, `node "${node.label}" on the page`).toContain(node.label);
  }

  await expectNoDeadLinks(page);

  // Level 2 has no node sheets, so a node link there would be a dead one.
  expect(await page.locator('main a[href^="#node-"]').count(), 'no node sheet links at level 2').toBe(0);
  // Structured values are printed as text, never as raw JSON.
  expect(text, 'no raw JSON in the document').not.toContain('{"');

  expect(await page.locator('main svg').count(), 'inline diagram per layer').toBeGreaterThanOrEqual(root.layers.length);
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/doc-level2.png', fullPage: true });
});

test('the cover carries one wordmark, and the running header comes from the page margin under print', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'print media and the margin boxes are checked in Chromium only');
  const all = await workspace(page);
  const title = all.towers[towerIdFor(all, 'dev-squad')].name;
  await page.goto('/?doc=dev-squad&level=2');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
  // The wordmark is real text: selectable and searchable in the PDF. The cover has one mark, not two.
  await expect(page.locator('main .cover .mark-word')).toHaveText('FLOW//TOWER');
  await expect(page.locator('main .cover .mark')).toHaveCount(1);

  // The running header is drawn by CSS @page margin boxes, so the old on-page header must not show in print.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('main .letterhead')).toBeHidden();
  const running = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--doc-running'));
  expect(running, 'the running header names the tower').toContain(title.toUpperCase());
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('main .letterhead')).toBeVisible();
});

test('the full document links node names to their sheets and prints no raw JSON', async ({ page }) => {
  await page.goto('/?doc=dev-squad&level=3');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
  const text = await page.locator('main').innerText();
  expect(text, 'no raw JSON in the document').not.toContain('{"');
  expect(await page.locator('main a[href^="#node-"]').count(), 'node names link to their sheets').toBeGreaterThan(0);
  await expectNoDeadLinks(page);
});

test('the document prints to PDF at each level, and the full one is larger', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'page.pdf works in Chromium only');
  test.setTimeout(240_000);
  mkdirSync(PDF_DIR, { recursive: true });
  const all = await workspace(page);

  for (const folder of TOWERS) {
    const tower = towerIdFor(all, folder);
    const sizes: Record<number, number> = {};
    const pages: Record<number, number> = {};
    for (const level of [1, 2, 3]) {
      await page.goto(`/?doc=${folder}&level=${level}`);
      await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
      // A half-built page must never be printed: the placeholder is gone and the document is in place.
      await expect(page.getByText('Building the document…')).toHaveCount(0);
      await expect(page.locator('main.doc')).toHaveCount(1);
      await page.emulateMedia({ media: 'print' });
      const path = `${PDF_DIR}/${folder}-level${level}.pdf`;
      await page.pdf({ path, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
      sizes[level] = statSync(path).size;
      pages[level] = pageCount(path);
      expect(sizes[level], `${path} is a real document (${tower})`).toBeGreaterThan(10 * 1024);
      await page.emulateMedia({ media: 'screen' });
    }
    expect(sizes[3], `${folder}: level 3 is larger than level 2`).toBeGreaterThan(sizes[2]);
    expect(pages[3], `${folder}: level 3 has more pages than level 2`).toBeGreaterThan(pages[2]);
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
