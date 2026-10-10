import { describe, expect, it } from 'vitest';
import { edgeText, LABEL, layoutTower } from '../src/app/layout';
import { SCALE } from '../src/app/theme';
import { loadLibrary } from '../src/core/loader';

describe('edge labels', () => {
  it('never sit under a node, in any example layer', async () => {
    const { workspace } = await loadLibrary(['examples']);
    const overlaps: string[] = [];
    for (const tower of Object.values(workspace.towers)) {
      const layout = await layoutTower(tower);
      for (const ll of layout.layers) {
        for (const e of ll.edges) {
          const text = edgeText(e);
          if (!text) continue;
          expect(e.labelAt, `${tower.id} ${e.id} has a placed label`).toBeDefined();
          const [x, z] = e.labelAt!;
          const [hw, hd] = [((text.length * LABEL.char + 8) * SCALE) / 2, (LABEL.h * SCALE) / 2];
          for (const b of Object.values(ll.nodes)) {
            if (Math.abs(x - b.x) < hw + b.w / 2 && Math.abs(z - b.z) < hd + b.d / 2) overlaps.push(`${tower.id}: "${text}" over ${b.key}`);
          }
        }
      }
    }
    expect(overlaps).toEqual([]);
  }, 30_000); // lays out every example tower
});
