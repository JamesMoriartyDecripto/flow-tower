import { mkdirSync, readFileSync, statSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openProject, test, ws } from './fixtures.ts';

/**
 * The document view (?doc=…&level=N) is what the PDF menu prints: its HTML must hold every node, its
 * anchors must resolve, and page.pdf must produce real files at each level.
 *
 * Every 3D figure costs software WebGL time, so the tests that do not check the figures load the page with
 * `snap=0` (the placeholder text, no captures). Only the figure test and the PDF-per-level test take snapshots.
 */

const PDF_DIR = 'test-results/pdf';
const TOWERS = ['dev-squad', 'game-studio'];
// Snapshots: up to 3 tries of 20 s per chapter, one chapter at a time, so a load can take minutes.
const SNAP_READY_MS = 180_000;

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
  await page.goto('/?doc=dev-squad&level=2&snap=0');
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

test('the overview charts: the root chapter has the layer matrix and the sub-tower tree', async ({ page }) => {
  await page.goto('/?doc=dev-squad&level=2&snap=0');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
  const root = page.locator('main article.chapter').first();
  await expect(root.locator('[data-chart="matrix"]'), 'the layer-to-layer matrix').toHaveCount(1);
  await expect(root.locator('[data-chart="tree"]'), 'the sub-tower tree').toHaveCount(1);
  // Every chapter at level 2 holds at least the five overview charts, so none prints bare.
  const counts = await page.locator('main article.chapter').evaluateAll((as) =>
    as.map((a) => a.querySelectorAll('[data-chart]').length));
  for (const n of counts) expect(n, 'charts in a chapter').toBeGreaterThanOrEqual(5);
});

test('the cover carries one wordmark, and the running header comes from the page margin under print', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'print media and the margin boxes are checked in Chromium only');
  const all = await workspace(page);
  const title = all.towers[towerIdFor(all, 'dev-squad')].name;
  await page.goto('/?doc=dev-squad&level=2&snap=0');
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

/** The document control table's fingerprint cell: 16 lower-case hex digits, the first of a sha256. */
async function fingerprintOf(page: Page, url: string): Promise<string> {
  await page.goto(url);
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
  const cell = page.locator('[data-field="fingerprint"]');
  await expect(cell).toHaveCount(1);
  return (await cell.innerText()).trim();
}

test('the document control table shows a 16-hex fingerprint, the same on every load', async ({ page }) => {
  const url = '/?doc=dev-squad&level=2&snap=0';
  const first = await fingerprintOf(page, url);
  expect(first).toMatch(/^[0-9a-f]{16}$/);
  const second = await fingerprintOf(page, url);
  expect(second, 'the same URL loaded twice gives the same fingerprint').toBe(first);
});

test('the full document links node names to their sheets and prints no raw JSON', async ({ page }) => {
  await page.goto('/?doc=dev-squad&level=3&snap=0');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
  const text = await page.locator('main').innerText();
  expect(text, 'no raw JSON in the document').not.toContain('{"');
  expect(await page.locator('main a[href^="#node-"]').count(), 'node names link to their sheets').toBeGreaterThan(0);
  await expectNoDeadLinks(page);
});

test('the project files appendix prints the full text of a referenced file, with line numbers', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?doc=dev-squad&level=3&snap=0');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 110_000 });
  const entry = page.locator('main .file-entry[data-file-key$=":: src/triage.ts"]');
  await expect(entry, 'src/triage.ts is in the appendix').toHaveCount(1);
  await expect(entry.locator('.file-text .file-no').first(), 'the text has line numbers').toHaveText('1');
  const shown = await entry.locator('.file-text').innerText();
  expect(shown.length, 'the full text, not a stub').toBeGreaterThan(100);
  expect(entry.locator('.file-skipped')).toHaveCount(0);
});

test('the document prints to PDF at each level, and the full one is larger', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'page.pdf works in Chromium only');
  // Six loads with snapshots (two towers, three levels), each waiting up to 180 s, plus the PDF writes.
  test.setTimeout(900_000);
  mkdirSync(PDF_DIR, { recursive: true });
  const all = await workspace(page);

  for (const folder of TOWERS) {
    const tower = towerIdFor(all, folder);
    const sizes: Record<number, number> = {};
    const pages: Record<number, number> = {};
    for (const level of [1, 2, 3]) {
      await page.goto(`/?doc=${folder}&level=${level}`);
      await page.waitForSelector('html[data-doc-ready="1"]', { timeout: SNAP_READY_MS });
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

/** One load of the level-2 page: every 3D figure is checked, and the drawn count is returned. */
async function checkFiguresOnce(page: Page, browserName: string, run: number): Promise<number> {
  await page.goto('/?doc=dev-squad&level=2');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: SNAP_READY_MS });
  const chapters = page.locator('main article.chapter');
  // The root and its two sub-towers are the chapters the figures belong to: level 2 prints every tower.
  expect(await chapters.count(), 'root and both sub-tower chapters').toBeGreaterThanOrEqual(3);
  const figures = chapters.locator('figure.snap-figure');
  const total = await figures.count();
  expect(total, 'one 3D figure per chapter').toBeGreaterThanOrEqual(3);
  let images = 0;
  for (let i = 0; i < total; i++) {
    const fig = figures.nth(i);
    const img = fig.locator('img');
    if (await img.count()) {
      const src = await img.getAttribute('src');
      expect(src, `run ${run}, figure ${i} is a PNG data URL`).toMatch(/^data:image\/png/);
      // The crop frames the tower, so the image is narrower than the 1600 px capture but still a real view.
      const width = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(width, `run ${run}, figure ${i} is a framed tower, not a sliver`).toBeGreaterThan(400);
      images++;
    } else {
      await expect(fig.locator('.snap-missing'), `run ${run}, figure ${i} shows a placeholder`).toContainText('3D view unavailable:');
    }
  }
  if (browserName === 'chromium') expect(images, `run ${run}: every 3D figure is drawn`).toBe(total);
  // The PDF output carries the figure count, so a reader of the test log sees how many 3D views printed.
  console.log(`3D figures, run ${run}: ${images}/${total} drawn`);
  return images;
}

test('the 3D figures: the level-2 page draws every figure, three runs in a row', async ({ page, browserName }) => {
  // Three loads, each waiting up to 180 s for its snapshots (one chapter at a time, up to 3 tries each).
  test.setTimeout(600_000);
  for (let run = 1; run <= 3; run++) {
    await checkFiguresOnce(page, browserName, run);
  }
});

test('the library (level 4) prints every named project with its own cover, and no dead link', async ({ page, browserName }) => {
  await page.goto('/?doc=library&level=4&projects=dev-squad,game-studio&snap=0');
  await page.waitForSelector('html[data-doc-ready="1"]', { timeout: 60_000 });
  await expect(page.getByText('Building the document…')).toHaveCount(0);
  await expect(page.locator('main.doc.level-4')).toHaveCount(1);
  // One library cover, then one project cover per named project: the wordmark appears once per cover.
  await expect(page.locator('main .library-project .cover')).toHaveCount(2);
  await expect(page.locator('main > .cover')).toHaveCount(1);
  await expectNoDeadLinks(page);
  expect(await page.locator('main a[href^="#"]').count(), 'the library has contents links').toBeGreaterThan(0);

  if (browserName !== 'chromium') return;
  test.setTimeout(120_000);
  mkdirSync(PDF_DIR, { recursive: true });
  await page.emulateMedia({ media: 'print' });
  const path = `${PDF_DIR}/library-level4.pdf`;
  await page.pdf({ path, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
  expect(statSync(path).size, 'the library PDF is a real document').toBeGreaterThan(10 * 1024);
  expect(pageCount(path), 'the library PDF has more pages than one project').toBeGreaterThan(2);
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
