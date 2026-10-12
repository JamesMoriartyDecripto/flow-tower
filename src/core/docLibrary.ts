import { anchor, clearDeadAnchors, LEVEL_NAMES, towerDoc, type TowerDoc } from './doc.ts';
import { classificationOf, includedTowers } from './docSummary.ts';
import type { Workspace } from './types.ts';

/*
 * Level 4: one PDF for several projects. Each project is printed at level 2 with its anchors prefixed by
 * the project id, so a sub-tower that two projects share still gets one id per project. Pure, no DOM.
 */

/** The printed name of the library: the cover, the control block and the running header all use it. */
export const LIBRARY_TITLE = 'Tower library';

/**
 * The projects a library prints: the named ones, in workspace order, or every project when none is named.
 * A name matches a project by its id, its folder, or the tower it resolves to; a name that matches nothing
 * is dropped, so a typo in a shared link prints the rest rather than failing.
 */
export function libraryProjects(ws: Workspace, wanted?: string[], resolve: (name: string) => string | undefined = () => undefined): string[] {
  if (!wanted || wanted.length === 0) return [...ws.projects];
  const names = new Set(wanted.map((w) => w.trim()).filter(Boolean));
  return ws.projects.filter((id) => {
    const folder = id.split('/')[0];
    return names.has(id) || names.has(folder) || [...names].some((n) => resolve(n) === id);
  });
}

/** The library document: a cover over every project, a contents list of projects, then each project's level-2 document. */
export function libraryDoc(ws: Workspace, projectIds: string[], opts: { generator?: string } = {}): TowerDoc {
  const projects = projectIds.map((id) => towerDoc(ws, id, 2, { generator: opts.generator, idPrefix: anchor(id) }));
  const total = (k: 'layers' | 'nodes' | 'agents' | 'subTowers') => projects.reduce((n, p) => n + p.generated.counts[k], 0);
  const counts = { layers: total('layers'), nodes: total('nodes'), agents: total('agents'), subTowers: total('subTowers') };

  // One classification for the whole library: the highest sensitivity on any printed node in any project.
  const depths = new Map<string, number>();
  for (const id of projectIds) for (const [k, v] of includedTowers(ws, id, 0)) if (!depths.has(k)) depths.set(k, v);

  const doc: TowerDoc = {
    title: LIBRARY_TITLE,
    towerId: 'library',
    level: 4,
    generated: { tags: [], counts },
    control: {
      tower: LIBRARY_TITLE,
      source: 'library',
      generator: opts.generator ?? 'Flow Tower',
      level: LEVEL_NAMES[4],
      classification: classificationOf(ws, depths),
      layers: counts.layers,
      nodes: counts.nodes,
      subTowers: counts.subTowers,
    },
    // A project row links to the project's own heading; its layers sit one step under it, as in a tower.
    toc: projects.flatMap((p) => [
      ...(p.chapters[0] ? [{ anchor: p.chapters[0].id, label: p.title, depth: 0 }] : []),
      ...p.toc.map((e) => ({ ...e, depth: e.depth + 1 })),
    ]),
    chapters: projects.flatMap((p) => p.chapters),
    projects,
  };
  clearDeadAnchors(doc);
  return doc;
}
