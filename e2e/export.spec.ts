import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openProject, pressUntil, test, tower, ws } from './fixtures.ts';

/** P and X download the view as PNG (post-processing included) and as an SVG diagram. */

const ID = ws.projects.find((p) => p.startsWith('dev-squad/'))!;

async function download(page: Page, key: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press(key)]);
  return { name: file.suggestedFilename(), path: await file.path() };
}

/** Width, height and how many distinct colors a PNG has (a blank capture has one or two). */
async function inspectPng(page: Page, path: string) {
  const b64 = readFileSync(path).toString('base64');
  return page.evaluate(async (data) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, img.width, img.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < px.length; i += 4 * 97) colors.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    return { w: img.width, h: img.height, colors: colors.size };
  }, b64);
}

for (const quality of ['eco', 'balanced']) {
  test(`export PNG and SVG (${quality})`, async ({ page }) => {
    await openProject(page, ID, `quality=${quality}`);
    await page.waitForTimeout(1500);

    const png = await download(page, 'p');
    expect(png.name).toBe('dev-squad.png');
    const info = await inspectPng(page, png.path);
    expect(info.w).toBeGreaterThan(400);
    expect(info.colors, 'the capture is not blank').toBeGreaterThan(50);

    const all = await download(page, 'x');
    expect(all.name).toBe('dev-squad.svg');
    const svg = readFileSync(all.path, 'utf8');
    expect(svg.match(/<g class="layer"/g)).toHaveLength(tower(ID).layers.length);

    await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 0);
    await pressUntil(page, 'PageDown', (s) => s.focusedLayer === 1);
    const one = await download(page, 'x');
    expect(one.name).toMatch(/^dev-squad-.+\.svg$/);
    expect(readFileSync(one.path, 'utf8').match(/<g class="node"/g)).toHaveLength(tower(ID).layers[1].nodes.length);
  });
}
