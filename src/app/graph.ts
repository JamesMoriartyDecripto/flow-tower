import type { ResolvedEdge, ResolvedNode, ResolvedTower, Workspace } from '../core/types';

export const allEdges = (t: ResolvedTower): ResolvedEdge[] => [...t.layers.flatMap((l) => l.edges), ...t.links];

/** Every node and edge reachable upstream and downstream of `key`. */
export function related(tower: ResolvedTower, key: string): { nodes: Set<string>; edges: Set<string> } {
  const edges = allEdges(tower);
  const nodes = new Set([key]);
  const hit = new Set<string>();
  const walk = (dir: 'from' | 'to') => {
    const other = dir === 'from' ? 'to' : 'from';
    const queue = [key];
    const seen = new Set([key]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of edges) {
        if (e[dir] !== cur) continue;
        hit.add(e.id);
        if (!seen.has(e[other])) { seen.add(e[other]); nodes.add(e[other]); queue.push(e[other]); }
      }
    }
  };
  walk('from');
  walk('to');
  return { nodes, edges: hit };
}

export function neighbours(tower: ResolvedTower, key: string) {
  const edges = allEdges(tower);
  return {
    incoming: edges.filter((e) => e.to === key),
    outgoing: edges.filter((e) => e.from === key),
  };
}

/** Relevance of a node for a search query (0 = no match). Label hits rank above description hits. */
export function score(node: ResolvedNode, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = node.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (node.id.toLowerCase().includes(q)) return 50;
  const ops = node.ops;
  if ([node.type, node.model, node.runtime?.id, node.runtime?.label, ...node.tools, ops.trigger?.kind, ops.trigger?.source, ops.data?.sensitivity, ops.data?.region, ops.version]
    .some((v) => v?.toLowerCase().includes(q))) return 30;
  return node.description?.toLowerCase().includes(q) ? 10 : 0;
}

export const matches = (node: ResolvedNode, query: string) => score(node, query) > 0;

/** Best match first. */
export function search(nodes: ResolvedNode[], query: string): ResolvedNode[] {
  return nodes.map((n) => [n, score(n, query)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

/** Breadcrumb from a library project down to `towerId` (through nested `tower:` links), if reachable. */
export function towerPath(ws: Workspace, towerId: string): string[] | undefined {
  const queue: string[][] = ws.projects.map((p) => [p]);
  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    const id = path[path.length - 1];
    if (id === towerId) return path;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of ws.towers[id]?.layers ?? []) for (const n of l.nodes) if (n.tower) queue.push([...path, n.tower]);
  }
}

/**
 * `?tower=…&layer=…&node=…` on page load, for shared links and screenshots. `tower` is the id
 * (`db-api-playbook/towers/request.tower.yaml`), the file name without `.tower.yaml`, or the name;
 * without it, the first project. `layer` (id) focuses a layer; `node` (`layer.node`) selects a node and focuses its layer.
 */
export function deepLink(ws: Workspace, search: string) {
  const q = new URLSearchParams(search);
  const want = q.get('tower');
  const layerId = q.get('layer');
  const nodeKey = q.get('node');
  if (!want && !layerId && !nodeKey) return undefined;
  const towers = Object.values(ws.towers);
  const tower = !want ? ws.towers[ws.projects[0]] : ws.towers[want]
    ?? towers.find((t) => t.id === `${want}.tower.yaml` || t.id.endsWith(`/${want}.tower.yaml`))
    ?? towers.find((t) => t.name.toLowerCase() === want.toLowerCase());
  const stack = tower && towerPath(ws, tower.id);
  if (!tower || !stack) return undefined;
  const at = (id: string | null) => (id ? tower.layers.findIndex((l) => l.id === id) : -1);
  const node = nodeKey ? tower.layers.flatMap((l) => l.nodes).find((n) => n.key === nodeKey) : undefined;
  const layer = node ? at(node.layer) : at(layerId);
  return { stack, selected: node?.key, focusedLayer: layer < 0 ? undefined : layer };
}
