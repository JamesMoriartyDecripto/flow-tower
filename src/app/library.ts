import type { ResolvedTower, Workspace } from '../core/types';

/**
 * The project gallery's own logic, kept free of React: the panel renders it and the voice agent's
 * `library_filter` tool counts with it (#145c), so the count the agent reports is the one on screen.
 */

export interface Stats {
  layers: number;
  nodes: number;
  agents: number;
  links: number;
  subTowers: number;
  depth: number;
  models: string[];
  runtimes: [string, number][];
  errors: number;
  warnings: number;
  updatedAt?: string;
}

/** Aggregates a project and every tower nested below it. */
export function projectStats(ws: Workspace, id: string): Stats {
  const s: Stats = { layers: 0, nodes: 0, agents: 0, links: 0, subTowers: 0, depth: 0, models: [], runtimes: [], errors: 0, warnings: 0 };
  const models = new Set<string>();
  const kinds = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const visit = (tid: string, depth: number) => {
    const t = ws.towers[tid];
    if (!t || seen.has(tid)) return;
    seen.add(tid);
    s.depth = Math.max(s.depth, depth);
    if (depth > 0) s.subTowers++;
    if (t.updatedAt && (!s.updatedAt || t.updatedAt > s.updatedAt)) s.updatedAt = t.updatedAt;
    for (const i of t.issues) { if (i.level === 'error') s.errors++; if (i.level === 'warning') s.warnings++; }
    for (const r of Object.values(t.runtimes)) kinds.set(r.kind, (kinds.get(r.kind) ?? new Set()).add(r.id));
    s.layers += t.layers.length;
    s.links += t.links.length + t.layers.reduce((a, l) => a + l.edges.length, 0);
    for (const l of t.layers) for (const n of l.nodes) {
      s.nodes++;
      if (n.type === 'agent') s.agents++;
      if (n.model) models.add(n.model.replace(/^claude-/, ''));
      if (n.tower) visit(n.tower, depth + 1);
    }
  };
  visit(id, 0);
  s.models = [...models].sort();
  s.runtimes = [...kinds].map(([k, ids]) => [k, ids.size] as [string, number]).sort((a, b) => b[1] - a[1]);
  return s;
}

/** What the filter box and the tag chip match on: name, description, id, tags and the models in use. */
export function projectMatches(tower: ResolvedTower, id: string, query: string, tag: string | undefined, models: string[]): boolean {
  if (tag && !tower.tags.includes(tag)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [tower.name, tower.description, id, ...tower.tags, ...models].some((v) => v?.toLowerCase().includes(q));
}

/**
 * The window event the Library panel listens for: the voice agent's `library_filter` tool dispatches it
 * so the filter box and the tag chip on screen are the ones the tool said it set (#145c).
 * `detail: { query?, tag? }` sets both; an absent field clears that one.
 */
export const LIBRARY_FILTER_EVENT = 'flow-tower:library-filter';
export interface LibraryFilter { query?: string; tag?: string }

/** The top-level projects matching a filter, in library order: what the panel shows and the tool counts. */
export function matchingProjects(ws: Workspace, filter: LibraryFilter): string[] {
  return ws.projects.filter((id) => projectMatches(ws.towers[id], id, filter.query ?? '', filter.tag, projectStats(ws, id).models));
}
