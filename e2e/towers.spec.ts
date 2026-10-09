import type { Page } from '@playwright/test';
import { emit, expect, expectCanvas, openProject, pressUntil, state, subTowers, test, tower, ws } from './fixtures.ts';

/**
 * One test per project: open it, walk every layer from the keyboard, use the node panel, switch to map
 * view and back, and enter / leave every sub-tower (recursively) with S, Enter and Backspace.
 */

async function walkLayers(page: Page, id: string) {
  const t = tower(id);
  for (let i = 0; i < t.layers.length; i++) {
    await pressUntil(page, 'PageDown', (s) => s.focusedLayer === i);
    // The first arrow selects a node of the focused layer.
    await pressUntil(page, 'ArrowRight', (s) => !!s.selected);
    const s = await state(page);
    expect(t.layers.some((l) => l.nodes.some((n) => n.key === s.selected)), `selected ${s.selected} exists`).toBe(true);
  }
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === undefined && !s.selected);
}

async function useInspector(page: Page) {
  await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 0);
  await pressUntil(page, 'ArrowRight', (s) => !!s.selected);
  await page.keyboard.press('i');
  await expect(page.locator('.inspector')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.inspector'))).toBe(true);
  const tab = () => page.evaluate(() => document.activeElement?.textContent ?? '');
  const first = await tab();
  await page.keyboard.press(']');
  // The tab bar refocuses its new button after rendering: wait for it, as a person would.
  await expect.poll(tab).not.toBe(first);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape'); // leaves the panel
  await expect.poll(() => page.evaluate(() => !document.activeElement?.closest('.inspector'))).toBe(true);
  // C walks cross-layer connections when there are any; B comes back.
  const before = (await state(page)).selected;
  await page.keyboard.press('c');
  await page.keyboard.press('b');
  expect((await state(page)).selected).toBe(before);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ selected: undefined, focusedLayer: undefined });
}

/** M flips the view and back. Towers over 10 layers open as a map by default ("auto"). */
async function toggleMap(page: Page) {
  const start = (await state(page)).view;
  await page.keyboard.press('m');
  await expect.poll(async () => (await state(page)).view).toBe(start === 'map' ? 'tower' : 'map');
  await expectCanvas(page);
  await page.keyboard.press('m');
  await expect.poll(async () => (await state(page)).view).toBe(start);
}

/** S cycles the sub-tower nodes, Enter dives in, Backspace returns to the owner node. */
async function visitSubTowers(page: Page, id: string, depth: number) {
  const subs = subTowers(tower(id));
  const seen = new Set<string>();
  for (let k = 0; k < subs.length * 2 && seen.size < subs.length; k++) {
    await page.keyboard.press('s');
    const owner = (await state(page)).selected;
    const node = subs.find((n) => n.key === owner);
    expect(node, `S selected ${owner}, a sub-tower node`).toBeTruthy();
    if (seen.has(owner!)) continue;
    seen.add(owner!);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await state(page)).stack.at(-1)).toBe(node!.tower);
    expect((await state(page)).stack).toHaveLength(depth + 1);
    await expectCanvas(page);
    await visitSubTowers(page, node!.tower!, depth + 1);
    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await state(page)).stack.at(-1)).toBe(id);
    expect((await state(page)).selected, 'back on the owner node').toBe(owner);
  }
  expect(seen.size, `every sub-tower of ${id} visited`).toBe(subs.length);
  if (subs.length) await page.keyboard.press('Escape');
}

for (const id of ws.projects) {
  test(`tower: ${tower(id).name}`, async ({ page }) => {
    await emit('tower.open', 'tool.start', tower(id).name);
    await openProject(page, id);
    expect(tower(id).issues.filter((i) => i.level !== 'info')).toEqual([]);

    await emit('tower.keyboard', 'tool.start', `${tower(id).layers.length} layers`);
    await walkLayers(page, id);
    await useInspector(page);
    await emit('tower.map', 'tool.start', 'map view');
    await toggleMap(page);
    await emit('tower.subs', 'tool.start', `${subTowers(tower(id)).length} sub-towers`);
    await visitSubTowers(page, id, 1);

    // The map choice must carry into sub-towers too.
    if (subTowers(tower(id)).length) {
      const chosen = (await state(page)).view === 'map' ? 'tower' : 'map';
      await page.keyboard.press('m');
      await page.keyboard.press('s');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await state(page)).stack.length).toBe(2);
      expect((await state(page)).view).toBe(chosen);
      await page.keyboard.press('Backspace');
      await page.keyboard.press('m');
    }
    await emit('tower.subs', 'tool.end', tower(id).name, 'ok');
  });
}

test('every referenced file is served by /api/file', async ({ request }) => {
  const failures: string[] = [];
  for (const [id, t] of Object.entries(ws.towers)) {
    const paths = new Set<string>();
    for (const n of t.layers.flatMap((l) => l.nodes)) {
      n.files.forEach((f) => paths.add(f));
      n.agent?.files.forEach((f) => paths.add(f));
      n.resources.forEach((r) => r.path && paths.add(r.path));
    }
    for (const path of paths) {
      const res = await request.get(`/api/file?tower=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`);
      // 415 = binary (images, recordings): served as a link, not previewed.
      if (![200, 415].includes(res.status())) failures.push(`${res.status()} ${id} ${path}`);
    }
  }
  await emit('tower.files', 'tool.end', `${failures.length} unreadable references`, failures.length ? 'error' : 'ok');
  expect(failures).toEqual([]);
});

test('the file API refuses paths outside the tower root', async ({ request }) => {
  const id = ws.projects[0];
  for (const path of ['../../package.json', '/etc/hosts', '..%2F..%2Fpackage.json', 'prompts/../../../../package.json']) {
    const res = await request.get(`/api/file?tower=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`);
    expect([403, 404], `${path} → ${res.status()}`).toContain(res.status());
  }
});
