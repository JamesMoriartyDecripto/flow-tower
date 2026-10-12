import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { libraryDoc, libraryProjects } from '../src/core/docLibrary';
import type { TowerDoc } from '../src/core/doc';
import type { Workspace } from '../src/core/types';

const load = async (): Promise<Workspace> => (await loadLibrary(['examples/dev-squad', 'examples/game-studio'])).workspace;

/** Every anchor the document defines (chapters, layers, node details), in print order, duplicates kept. */
function definedAnchors(doc: TowerDoc): string[] {
  const out: string[] = [];
  for (const c of doc.chapters) {
    out.push(c.id);
    for (const l of c.layers) {
      out.push(l.id);
      for (const d of l.details ?? []) out.push(d.id);
    }
  }
  return out;
}

describe('level 4: the library document', () => {
  it('keeps every anchor unique across projects, so no id is defined twice', async () => {
    const ws = await load();
    const doc = libraryDoc(ws, libraryProjects(ws));
    const ids = definedAnchors(doc);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size, 'no duplicate anchor').toBe(ids.length);
  });

  it('prefixes each project anchor with its project id, and keeps a shared link inside its own project', async () => {
    const ws = await load();
    const doc = libraryDoc(ws, libraryProjects(ws));
    for (const p of doc.projects ?? []) {
      for (const c of p.chapters) expect(c.id.startsWith('dev-squad') || c.id.startsWith('game-studio')).toBe(true);
    }
    const refs: string[] = [];
    for (const c of doc.chapters) {
      for (const l of c.links) refs.push(...[l.from.anchor, l.to.anchor].filter((a): a is string => !!a));
    }
    const defined = new Set(definedAnchors(doc));
    for (const r of refs) expect(defined.has(r), `link ${r} has a target`).toBe(true);
  });

  it('prints every project in workspace order when none is named, and only the named ones otherwise', async () => {
    const ws = await load();
    expect(libraryProjects(ws)).toEqual(ws.projects);
    const picked = libraryProjects(ws, ['game-studio']);
    expect(picked).toHaveLength(1);
    expect(picked[0].startsWith('game-studio/')).toBe(true);
    expect(libraryProjects(ws, ['no-such-project'])).toEqual([]);
  });

  it('sums the counts over the projects, and the cover names the library', async () => {
    const ws = await load();
    const doc = libraryDoc(ws, libraryProjects(ws));
    expect(doc.title).toBe('Tower library');
    expect(doc.level).toBe(4);
    const nodes = (doc.projects ?? []).reduce((n, p) => n + p.generated.counts.nodes, 0);
    expect(doc.generated.counts.nodes).toBe(nodes);
    expect(doc.control.nodes).toBe(nodes);
  });
});
