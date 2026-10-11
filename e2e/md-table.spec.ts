import type { Page } from '@playwright/test';
import { expect, openProject, test, tower, ws } from './fixtures.ts';

/**
 * Issue #133: `.md-view { overflow-wrap: anywhere }` made a table cell's min-content width one
 * character, so a wide table squeezed every column to that and printed its text one letter per line.
 * Cells now use `break-word`, whose min-content width is the longest word: the table keeps readable
 * columns and scrolls sideways. Assert both halves of that, or the fix could regress to either bug.
 */

// The model-benchmark example; ids are tower file paths, not bare directory names.
const ID = ws.projects.find((p) => p.startsWith('model-benchmark/'));
if (!ID) throw new Error('no model-benchmark project in the library');
const TABLE_FILE = 'results/example.md';
// Find the node that references the results table rather than hard-coding an id from the YAML.
const pick = (() => {
  for (const n of tower(ID).layers.flatMap((l) => l.nodes)) {
    const index = n.files.indexOf(TABLE_FILE);
    if (index >= 0) return { id: ID, files: n.files, index };
  }
  throw new Error(`no node references ${TABLE_FILE}`);
})();

const open = (page: Page) => page.evaluate((f) => (window as unknown as { __flowTower: { store: { getState(): { openFile(x: object): void } } } })
  .__flowTower.store.getState().openFile({ tower: f.id, files: f.files, index: f.index }), pick);

// A cell only renders without wrapping when it is at least as wide as its longest word, measured in
// that cell's own computed font. Runs in the browser, so it must stay free of outer references.
const wordWidths = (cells: Element[]) => cells.map((el) => {
  // A hyphen is a legal break point, so `vendor-a/model` can wrap after the `-` even with `break-word`;
  // splitting there too keeps the expectation honest instead of demanding the whole token fit on one line.
  const longest = (el.textContent ?? '').trim().split(/\s+/).flatMap((w) => w.split(/(?<=-)/)).reduce((a, b) => (b.length > a.length ? b : a), '');
  const style = getComputedStyle(el);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('no 2d canvas context');
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return { word: longest, needed: ctx.measureText(longest).width, actual: el.getBoundingClientRect().width };
});

test('md table: wide tables scroll instead of squeezing columns to one letter', async ({ page }) => {
  await openProject(page, ID);
  await open(page);
  const table = page.locator('.viewer .md-view table').first();
  await expect(table).toBeVisible();
  // measureText needs the real face, or a fallback font hides a column that is too narrow.
  await page.evaluate(() => document.fonts.ready);

  const headers = table.locator('th');
  expect(await headers.count(), 'the results table has many columns').toBeGreaterThanOrEqual(10);
  for (const { word, needed, actual } of await headers.evaluateAll(wordWidths)) {
    expect(actual, `header column "${word}" is at least as wide as its longest word`).toBeGreaterThanOrEqual(needed - 2);
  }

  // The bug squeezed the body too: headers have `white-space: nowrap`, so measuring only `th` would
  // keep passing even if `anywhere` came back on `td`. Every body cell must fit its longest word.
  const cells = await table.locator('td').evaluateAll(wordWidths);
  expect(cells.length, 'the table has body cells').toBeGreaterThan(0);
  for (const { word, needed, actual } of cells) {
    // A single character cannot wrap any tighter, so such a cell proves nothing; skip it.
    if (word.length < 2) continue;
    expect(actual, `body cell "${word}" is at least as wide as its longest word`).toBeGreaterThanOrEqual(needed - 2);
  }

  // The columns stay readable, so the table is wider than its box: it has to scroll, not overflow the page.
  const scroll = await table.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll.scroll, 'table scrolls horizontally').toBeGreaterThan(scroll.client);

  await page.screenshot({ path: 'test-results/md-table.png' });
});
