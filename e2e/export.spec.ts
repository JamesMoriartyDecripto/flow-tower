import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import type { ResolvedTower } from '../src/core/types.ts';
import { expect, openProject, test, ws } from './fixtures.ts';

/**
 * P and X download a ZIP: every layer and the map of the project and of each sub-tower, as Full HD
 * PNGs (plus the 3D view, post-processing included) or as SVG diagrams.
 */

const ID = ws.projects.find((p) => p.startsWith('dev-squad/'))!;
// Written out here (not imported from the app, whose modules load font files Node cannot import).
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const layerFile = (l: ResolvedTower['layers'][number]) => `L${String(l.index + 1).padStart(2, '0')}-${slug(l.title)}`;
const folders: { tower: ResolvedTower; dir: string }[] = [{ tower: ws.towers[ID], dir: slug(ws.towers[ID].name) }];
for (let i = 0; i < folders.length; i++) {
  for (const n of folders[i].tower.layers.flatMap((l) => l.nodes)) {
    const sub = n.tower ? ws.towers[n.tower] : undefined;
    if (sub && !folders.some((f) => f.tower.id === sub.id)) folders.push({ tower: sub, dir: `${folders[i].dir}/${slug(sub.name)}` });
  }
}
const expected = (ext: string) => folders.flatMap(({ tower, dir }) => [`${dir}/00-map.${ext}`, ...tower.layers.map((l) => `${dir}/${layerFile(l)}.${ext}`)]);

async function download(page: Page, key: string) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.keyboard.press(key)]);
  return { name: file.suggestedFilename(), files: unzipSync(readFileSync(await file.path())) };
}

/** Width, height and how many distinct colors a PNG has (a blank capture has one or two). */
async function inspectPng(page: Page, png: Uint8Array) {
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, img.width, img.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < px.length; i += 4 * 97) colors.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    return { w: img.width, h: img.height, colors: colors.size };
  }, Buffer.from(png).toString('base64'));
}

test('the SVG pack has every layer and map of the project and its sub-towers', async ({ page }) => {
  expect(folders.length, 'dev-squad has sub-towers').toBeGreaterThan(1);
  await openProject(page, ID);
  const svg = await download(page, 'x');
  expect(svg.name).toBe(`${folders[0].dir}-svg.zip`);
  expect(Object.keys(svg.files).sort()).toEqual(expected('svg').sort());
  const { tower, dir } = folders[1];
  const map = new TextDecoder().decode(svg.files[`${dir}/00-map.svg`]);
  expect(map.match(/<g class="layer"/g)).toHaveLength(tower.layers.length);
});

for (const quality of ['eco', 'balanced']) {
  test(`the PNG pack is Full HD and includes the 3D view (${quality})`, async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page, ID, `quality=${quality}`);
    await page.waitForTimeout(1500);
    const png = await download(page, 'p');
    expect(png.name).toBe(`${folders[0].dir}-png.zip`);
    const view = `${folders[0].dir}/view-3d.png`;
    expect(Object.keys(png.files).sort()).toEqual([...expected('png'), view].sort());

    const shot = await inspectPng(page, png.files[view]);
    expect(shot.w).toBeGreaterThan(400);
    expect(shot.colors, 'the 3D capture is not blank').toBeGreaterThan(50);

    // Layers and maps are Full HD: they fit 1920×1080 and fill it on one side.
    for (const file of [`${folders[0].dir}/${layerFile(folders[0].tower.layers[1])}.png`, `${folders[0].dir}/00-map.png`]) {
      const info = await inspectPng(page, png.files[file]);
      expect(info.w <= 1920 && info.h <= 1080, file).toBe(true);
      expect(info.w === 1920 || info.h === 1080, file).toBe(true);
      expect(info.colors, `${file} is not blank`).toBeGreaterThan(5);
    }
  });
}
