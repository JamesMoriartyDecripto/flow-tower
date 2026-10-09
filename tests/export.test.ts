import { describe, expect, it } from 'vitest';
import { towerSvg } from '../src/app/exportSvg';
import { layoutTower } from '../src/app/layout';
import { buildTower, loadLibrary } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';

describe('SVG export', () => {
  it('draws every node and edge of one layer, or of the whole tower stacked', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    const tower = workspace.towers[workspace.projects[0]];
    const layout = await layoutTower(tower);

    const one = towerSvg(tower, layout, { layers: [1] });
    expect(one.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(one.match(/<g class="node"/g)).toHaveLength(tower.layers[1].nodes.length);
    expect(one.match(/marker-end=/g)).toHaveLength(tower.layers[1].edges.length);
    expect(one).toContain(`${tower.name} — ${tower.layers[1].title}`);

    const all = towerSvg(tower, layout);
    expect(all.match(/<g class="layer"/g)).toHaveLength(tower.layers.length);
    expect(all.match(/<g class="node"/g)).toHaveLength(tower.layers.reduce((a, l) => a + l.nodes.length, 0));
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
