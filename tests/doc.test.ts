import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { anchor, towerDoc, type Chapter, type TowerDoc } from '../src/core/doc';
import type { Workspace } from '../src/core/types';

const load = async (): Promise<Workspace> => (await loadLibrary(['examples/dev-squad'])).workspace;

/** Every anchor the document defines: chapters, layers, node rows and details. */
function anchorsOf(doc: TowerDoc): Set<string> {
  const out = new Set<string>();
  for (const c of doc.chapters) {
    out.add(c.id);
    for (const l of c.layers) {
      out.add(l.id);
      for (const n of l.nodes) out.add(n.id);
      for (const d of l.details ?? []) out.add(d.id);
    }
  }
  return out;
}

const chapterCount = (doc: TowerDoc) => doc.chapters.length;

describe('anchor', () => {
  it('builds lower-case [a-z0-9-] ids from any parts', () => {
    expect(anchor('Node', 'dev_squad.tower.yaml', 'Intake/Triage!')).toBe('node-dev-squad-tower-yaml-intake-triage');
  });
});

describe('towerDoc', () => {
  it('level 1 keeps the layers but no node rows', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 1);
    const root = doc.chapters[0];
    expect(root.layers.length).toBeGreaterThan(0);
    expect(root.layers.every((l) => l.nodes.length === 0)).toBe(true);
    expect(doc.legend).toBeUndefined();
  });

  it('level 2 lists every node of the root tower exactly once', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 2);
    const root = ws.towers['dev-squad.tower.yaml'];
    const expected = root.layers.flatMap((l) => l.nodes.map((n) => n.key));
    const rows = doc.chapters[0].layers.flatMap((l) => l.nodes.map((n) => n.key));
    expect(rows).toEqual(expected);
    expect(new Set(rows).size).toBe(rows.length);
    expect(doc.legend?.types.length).toBeGreaterThan(0);
  });

  it('level 3 has a detail for every node of every included tower and resolvable anchors', async () => {
    const ws = await load();
    const doc = towerDoc(ws, 'dev-squad.tower.yaml', 3);
    expect(chapterCount(doc)).toBeGreaterThan(1);
    for (const c of doc.chapters) {
      const tower = ws.towers[c.towerId];
      const details = c.layers.flatMap((l) => l.details ?? []);
      expect(details.map((d) => d.key)).toEqual(tower.layers.flatMap((l) => l.nodes.map((n) => n.key)));
    }

    const anchors = anchorsOf(doc);
    const tocIds = doc.toc.map((t) => t.id);
    for (const id of tocIds) expect(anchors.has(id)).toBe(true);
    for (const c of doc.chapters) {
      for (const l of c.links) {
        expect(anchors.has(l.from.anchor)).toBe(true);
        expect(anchors.has(l.to.anchor)).toBe(true);
      }
      for (const d of c.layers.flatMap((l) => l.details ?? [])) {
        for (const e of [...d.incoming, ...d.outgoing]) expect(anchors.has(e.other.anchor)).toBe(true);
        if (d.subTower?.anchor) expect(anchors.has(d.subTower.anchor)).toBe(true);
      }
    }
    expect(doc.issues).toEqual(ws.towers['dev-squad.tower.yaml'].issues);
    expect(doc.sources).toEqual([...new Set(doc.sources)].sort());
  });

  it('stops nested chapters at maxDepth and does not loop', async () => {
    const ws = await load();
    const shallow = towerDoc(ws, 'dev-squad.tower.yaml', 3, { maxDepth: 1 });
    expect(shallow.chapters.every((c) => c.depth <= 1)).toBe(true);
    const none = towerDoc(ws, 'dev-squad.tower.yaml', 3, { maxDepth: 0 });
    expect(chapterCount(none)).toBe(1);
    const ids = towerDoc(ws, 'dev-squad.tower.yaml', 3).chapters.map((c: Chapter) => c.towerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic', async () => {
    const ws = await load();
    expect(towerDoc(ws, 'dev-squad.tower.yaml', 3)).toEqual(towerDoc(ws, 'dev-squad.tower.yaml', 3));
  });
});
