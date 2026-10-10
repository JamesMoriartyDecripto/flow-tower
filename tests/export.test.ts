import { describe, expect, it } from 'vitest';
import { layerFile, rasterScale, towerFolders, towerSvg } from '../src/app/exportSvg';
import { layoutTower } from '../src/app/layout';
import { buildTower, loadLibrary } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const size = (svg: string) => /width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(svg)!.slice(1).map(Number);

describe('SVG export', () => {
  it('draws every node and edge of one layer, or of the whole tower stacked or as a map', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    const tower = workspace.towers[workspace.projects[0]];
    const layout = await layoutTower(tower);

    const one = towerSvg(tower, layout, { layers: [1] });
    expect(one.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(count(one, /<g class="node"/g)).toBe(tower.layers[1].nodes.length);
    expect(count(one, /marker-end=/g)).toBe(tower.layers[1].edges.length);
    expect(one).toContain(`${tower.name} — ${tower.layers[1].title}`);

    const nodes = tower.layers.reduce((a, l) => a + l.nodes.length, 0);
    const stack = towerSvg(tower, layout);
    expect(count(stack, /<g class="layer"/g)).toBe(tower.layers.length);
    expect(count(stack, /<g class="node"/g)).toBe(nodes);

    // The map holds the same drawing in a grid: wider and shorter than the stack.
    const map = towerSvg(tower, layout, { arrange: 'map' });
    expect(count(map, /<g class="node"/g)).toBe(nodes);
    const [sw, sh] = size(stack);
    const [mw, mh] = size(map);
    expect(mw).toBeGreaterThan(sw);
    expect(mh).toBeLessThan(sh);
  });

  it('scales the pixel size for high definition and embeds fonts when asked', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    const tower = workspace.towers[workspace.projects[0]];
    const svg = towerSvg(tower, await layoutTower(tower), { layers: [0], scale: 3, css: '@font-face{font-family:X}' });
    const [w, h, vw, vh] = size(svg);
    expect([w, h]).toEqual([Math.round(vw * 3), Math.round(vh * 3)]);
    expect(svg).toContain('<defs><style>@font-face{font-family:X}</style>');
    // PNGs are Full HD: the longer side (relative to 16:9) is 1920 wide or 1080 tall.
    expect(rasterScale(960, 270) * 960).toBe(1920);
    expect(rasterScale(800, 900) * 900).toBe(1080);
    expect(rasterScale(12_000, 5000) * 12_000).toBe(1920);
  });

  it('lists the project and every sub-tower once, in nested folders', async () => {
    const { workspace } = await loadLibrary(['examples/game-studio']);
    const folders = towerFolders(workspace, workspace.projects[0]);
    const subs = new Set(Object.values(workspace.towers).flatMap((t) => t.layers.flatMap((l) => l.nodes.map((n) => n.tower)).filter(Boolean)));
    expect(folders.length).toBe(1 + subs.size);
    expect(new Set(folders.map((f) => f.tower.id)).size).toBe(folders.length);
    expect(folders[0].dir).toBe('forge-studio'); // the tower's name
    for (const f of folders.slice(1)) expect(f.dir.startsWith('forge-studio/')).toBe(true);
    expect(layerFile(folders[0].tower.layers[2])).toMatch(/^L03-[a-z0-9-]+$/);
  });

  it('escapes text and stays well-formed', async () => {
    const def = TowerSchema.parse({
      name: 'A & B <tower>',
      layers: [{ id: 'l', title: 'Say "hi" & <go>', nodes: [{ id: 'a', label: '<script>alert(1)</script>' }, { id: 'b', label: 'R&D' }], edges: ['a -> b: x < y & z'] }],
    });
    const tower = await buildTower(def, 't', { read: async () => undefined }, []);
    const svg = towerSvg(tower, await layoutTower(tower));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    // Every & starts an entity, and tags balance (a cheap well-formedness check without a DOM).
    expect(svg.match(/&(?!amp;|lt;|gt;|quot;)/g)).toBeNull();
    const open = (svg.match(/<(?!\/|\?|!)[a-z]+[^>]*[^/]>/g) ?? []).length;
    const close = (svg.match(/<\/[a-z]+>/g) ?? []).length;
    expect(open).toBe(close);
  });
});
