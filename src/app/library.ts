import type { ResolvedTower, Workspace } from '../core/types';
import { splitTarget } from '../core/events';
import type { NodeLive } from './live';
import { IDLE_MS } from './hub';
import { agoText } from './sharing';

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

/**
 * What the filter box, the tag chip and the source chip match on: name, description, id, tags and the models in use.
 * `source` is where the project came from ('local' or a machine id); `wanted` undefined means every source.
 */
export function projectMatches(tower: ResolvedTower, id: string, query: string, tag: string | undefined, models: string[], source = 'local', wanted?: string): boolean {
  if (wanted !== undefined && source !== wanted) return false;
  if (tag && !tower.tags.includes(tag)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [tower.name, tower.description, id, ...tower.tags, ...models].some((v) => v?.toLowerCase().includes(q));
}

/**
 * The window event the Library panel listens for: the voice agent's `library_filter` tool dispatches it
 * so the filter box and the tag chip on screen are the ones the tool said it set (#145c).
 * `detail: { query?, tag?, source? }` sets them all; an absent field clears that one.
 */
export const LIBRARY_FILTER_EVENT = 'flow-tower:library-filter';
export interface LibraryFilter { query?: string; tag?: string; source?: string }

/** The source of a project: `workspace.sources` names a machine id for a shared one; absent means this hub's own. */
export function sourceOf(ws: Workspace, id: string): string {
  return ws.sources?.[id] ?? 'local';
}

/** The sources the library can show: this hub's own ('local') and each machine that shares projects. */
export function knownSources(ws: Workspace): string[] {
  const machines = new Set(Object.values(ws.sources ?? {}).filter((s) => s !== 'local'));
  return ['local', ...[...machines].sort()];
}

/**
 * Matches a spoken source to a known id. Speech and hand-copied folders vary in case and in separators
 * ("Box-1", "box 1", "box_1", "box.1" all mean box-1), so both sides are compared with those removed.
 * An exact id wins first, so two ids that differ only by a separator stay distinct when named exactly.
 * "this hub", "this machine" and "this server" all mean the hub's own source ('local').
 */
const THIS_HUB = new Set(['thishub', 'thismachine', 'thisserver']);
export function sourceNamed(known: string[], spoken: unknown): string | undefined {
  const raw = String(spoken);
  const exact = known.find((id) => id === raw);
  if (exact !== undefined) return exact;
  const key = (v: string) => v.toLowerCase().replace(/[\s._-]/g, '');
  const said = key(raw);
  if (THIS_HUB.has(said)) return 'local';
  return known.find((id) => key(id) === said);
}

/** The chip text and title for a source; a machine's name is shown upper case, as the other chips are. */
export function sourceChip(source: string): { label: string; title: string; cls: 'local' | 'device' } {
  if (source === 'local') return { label: 'THIS HUB', title: "Part of this server's own library", cls: 'local' };
  return { label: source.toUpperCase(), title: `Shared by ${source} with flow-tower share`, cls: 'device' };
}

/** A machine's new version counts as fresh for this long: the card shows a dot until then. */
export const FRESH_SHARE_MS = 10 * 60_000;

/**
 * The "updated …" label of a shared project, from `workspace.sharedAt`. Undefined for a local project (no
 * entry). `dot` marks a version that arrived in the last 10 minutes; a time in the future counts as fresh.
 */
export function sharedLabel(sharedAt: number | undefined, machine: string, now: number): { text: string; title: string; dot: boolean } | undefined {
  if (sharedAt === undefined) return undefined;
  const text = `updated ${agoText(sharedAt, now)}`;
  return { text, title: `${machine} shared a new version ${agoText(sharedAt, now)}`, dot: now - sharedAt < FRESH_SHARE_MS };
}

/** A card lists the machines that sent events for its project within this window: the hub's idle threshold. */
export const RECENT_HOSTS_MS = IDLE_MS;
/** Up to this many machine names on a card; the rest become a "+N". */
const SHOWN_HOSTS = 3;

/**
 * The distinct machines that recently ran nodes of the given towers (a project and its sub-towers),
 * most recent first. A machine is named by the events it sent, so a stale one drops off on its own.
 */
export function recentHosts(nodes: Map<string, NodeLive>, towers: Set<string>, now: number): string[] {
  const latest = new Map<string, number>();
  for (const [key, n] of nodes) {
    const w = n.where;
    if (!w?.host || w.ts < now - RECENT_HOSTS_MS || !towers.has(splitTarget(key)[0])) continue;
    latest.set(w.host, Math.max(latest.get(w.host) ?? 0, w.ts));
  }
  return [...latest].sort((a, b) => b[1] - a[1]).map(([host]) => host);
}

/** "@a · @b · @c +N", or '' when no machine is recent. Pre-joined so the memoized cards stay cheap. */
export function hostsLabel(hosts: string[]): string {
  if (!hosts.length) return '';
  const shown = hosts.slice(0, SHOWN_HOSTS).map((h) => `@${h}`).join(' · ');
  const more = hosts.length - SHOWN_HOSTS;
  return more > 0 ? `${shown} +${more}` : shown;
}

/** The top-level projects matching a filter, in library order: what the panel shows and the tool counts. */
export function matchingProjects(ws: Workspace, filter: LibraryFilter): string[] {
  return ws.projects.filter((id) => projectMatches(ws.towers[id], id, filter.query ?? '', filter.tag, projectStats(ws, id).models, sourceOf(ws, id), filter.source));
}
