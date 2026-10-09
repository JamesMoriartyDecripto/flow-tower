import { expect, test as base, type Page } from '@playwright/test';
import { loadLibrary } from '../src/core/loader.ts';
import type { ResolvedTower, Workspace } from '../src/core/types.ts';

/** The same workspace the dev server serves (`examples/`), read at collection time to generate one test per tower. */
export const { workspace: ws } = await loadLibrary(['examples']);
export const tower = (id: string): ResolvedTower => ws.towers[id];

export interface AppState {
  stack: string[];
  library: boolean;
  selected?: string;
  focusedLayer?: number;
  view: 'tower' | 'map';
  file: boolean;
}

/** Snapshot of the app store through the dev-only hook (src/app/main.tsx). */
export const state = (page: Page): Promise<AppState> =>
  page.evaluate(() => {
    const s = (window as unknown as { __flowTower: { store: { getState(): AppState & { file?: unknown } } } }).__flowTower.store.getState();
    return { stack: s.stack, library: s.library, selected: s.selected, focusedLayer: s.focusedLayer, view: s.view, file: !!s.file };
  });

/** Reports audit progress to the Release Auditor tower, so the sweep is visible live in flow-tower itself. */
export async function emit(node: string, kind: string, message: string, status?: 'ok' | 'error') {
  // nosemgrep: react-insecure-request -- loopback dev server (false-positives.md rule 1)
  await fetch('http://127.0.0.1:5317/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, source: 'release-auditor', tower: 'E2E Sweep', node, message, status }),
    signal: AbortSignal.timeout(1500),
  }).catch(() => undefined);
}

/** Opens a project from the library and waits until its tower is on screen. */
export async function openProject(page: Page, id: string, query = 'quality=eco') {
  await page.goto(`/?${query}`);
  await page.locator(`[data-card="${id}"]`).click();
  await expect.poll(async () => (await state(page)).stack[0]).toBe(id);
  await expectCanvas(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

export async function expectCanvas(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
}

/**
 * Presses a key until the state matches. The ELK layout is async: on a big tower and a busy machine
 * the first arrows arrive before the layer is laid out, so retry by time, not by count.
 */
export async function pressUntil(page: Page, key: string, ok: (s: AppState) => boolean, ms = 20_000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    await page.keyboard.press(key);
    if (ok(await state(page))) return;
    await page.waitForTimeout(250);
  }
  expect(ok(await state(page)), `${key} never reached the expected state`).toBe(true);
}

export const subTowers = (t: ResolvedTower) => t.layers.flatMap((l) => l.nodes.filter((n) => n.tower));

/** Fails the test on any uncaught exception or console error: a bug sweep must not hide noise. */
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await use(errors);
    expect(errors, 'console and page errors').toEqual([]);
  }, { auto: true }],
});

export { expect };
export type { Workspace };
