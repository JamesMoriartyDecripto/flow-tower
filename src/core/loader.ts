import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { TowerSchema, type TowerDef } from './schema.ts';
import { parseEdge } from './edges.ts';
import { resolveAgent, resolvePromptDef, resolvePromptRef, type FileReader } from './resolve.ts';
import type { Issue, ResolvedAgent, ResolvedEdge, ResolvedLayer, ResolvedPrompt, ResolvedTower, Workspace } from './types.ts';

export interface LoadResult {
  workspace: Workspace;
  /** Tower id -> absolute root directory. Files may only be served from inside these. */
  roots: Map<string, string>;
  /** Every file the workspace depends on, for live reload. */
  watched: Set<string>;
}

/** Expands files and directories (scanned recursively) into a sorted list of tower files. */
export function findTowerFiles(entries: string[]): string[] {
  const out = new Set<string>();
  for (const entry of entries) {
    const abs = resolve(entry);
    if (!existsSync(abs)) continue;
    if (!statSync(abs).isDirectory()) { out.add(abs); continue; }
    for (const f of readdirSync(abs, { recursive: true, encoding: 'utf8' })) {
      const hidden = f.split(sep).some((seg) => seg === 'node_modules' || seg.startsWith('.'));
      if (f.endsWith('.tower.yaml') && !hidden) out.add(join(abs, f));
    }
  }
  return [...out].sort();
}

function commonDir(files: string[]): string {
  let base = dirname(files[0]);
  while (!files.every((f) => f.startsWith(base + sep)) && dirname(base) !== base) base = dirname(base);
  return base;
}

/**
 * Loads every tower found in `entries` plus the nested towers they reference.
 * Towers referenced by another tower are nested; the others become library projects.
 * Never throws on bad input: problems are reported as issues on the tower.
 */
export async function loadLibrary(entries: string[]): Promise<LoadResult> {
  const files = findTowerFiles(entries);
  const base = files.length ? commonDir(files) : resolve('.');
  const result: LoadResult = {
    workspace: { projects: [], towers: {}, loadedAt: new Date().toISOString() },
    roots: new Map(),
    watched: new Set(),
  };
  const nestedIds = new Set<string>();
  const queue = [...files];
  while (queue.length) {
    const file = queue.shift()!;
    const id = toId(base, file);
    if (result.workspace.towers[id]) continue;
    const { tower, root, nested } = await loadTower(file, id, result.watched);
    result.workspace.towers[id] = tower;
    result.roots.set(id, root);
    for (const n of nested) {
      const nid = toId(base, n.abs);
      if (nid !== id) nestedIds.add(nid);
      queue.push(n.abs);
      patchTowerRef(tower, n.ref, nid);
    }
  }
  result.workspace.projects = files.map((f) => toId(base, f)).filter((id) => !nestedIds.has(id));
  return result;
}

export const loadWorkspace = (file: string) => loadLibrary([file]);

const toId = (base: string, file: string) => relative(base, file).split(sep).join('/');

/** Rewrites a `tower:` path (relative to root) into the tower id used by the client. */
function patchTowerRef(tower: ResolvedTower, ref: string, id: string) {
  for (const layer of tower.layers) for (const node of layer.nodes) {
    if (node.tower === ref) node.tower = id;
    if (node.agent?.tower === ref) node.agent.tower = id;
  }
}

async function loadTower(file: string, id: string, watched: Set<string>) {
  watched.add(file);
  const issues: Issue[] = [];
  const empty = (root: string) => ({
    tower: { id, name: id, tags: [], runtimes: {}, layers: [], links: [], issues } as ResolvedTower, root, nested: [],
  });

  let raw: string;
  try { raw = await readFile(file, 'utf8'); } catch {
    issues.push({ level: 'error', message: `tower file not found: ${file}` });
    return empty(dirname(file));
  }

  const doc = parseDocument(raw);
  if (doc.errors.length) {
    for (const e of doc.errors) issues.push({ level: 'error', message: e.message });
    return empty(dirname(file));
  }

  const parsed = TowerSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    for (const e of parsed.error.issues) issues.push({ level: 'error', message: e.message, path: e.path.join('.') });
    return empty(dirname(file));
  }

  const def = parsed.data;
  const root = resolve(dirname(file), def.root ?? '.');
  const fs: FileReader = {
    async read(path) {
      const abs = resolve(root, path);
      watched.add(abs);
      try { return await readFile(abs, 'utf8'); } catch { return undefined; }
    },
  };
  const tower = await buildTower(def, id, fs, issues, (p) => existsSync(resolve(root, p)));
  const refs = new Set(tower.layers.flatMap((l) => l.nodes.flatMap((n) => [n.tower, n.agent?.tower])).filter(Boolean) as string[]);
  const nested = [...refs].map((ref) => ({ ref, abs: resolve(root, ref) }));
  return { tower, root, nested };
}

/** Turns a validated definition into the resolved model and collects issues. Pure aside from `fs`. */
export async function buildTower(
  def: TowerDef, id: string, fs: FileReader, issues: Issue[], exists: (p: string) => boolean = () => true,
): Promise<ResolvedTower> {
  const prompts: Record<string, ResolvedPrompt> = {};
  for (const [pid, p] of Object.entries(def.prompts)) prompts[pid] = await resolvePromptDef(p, fs, issues, `prompts.${pid}`, pid);

  const agents: Record<string, ResolvedAgent> = {};
  for (const [aid, a] of Object.entries(def.agents)) agents[aid] = await resolveAgent(aid, a, prompts, fs, issues);

  const runtimes = Object.fromEntries(Object.entries(def.runtimes).map(([rid, r]) => [rid, { ...r, id: rid }]));
  const runtimeOf = (ref: string | undefined, where: string) => {
    if (ref && !runtimes[ref]) issues.push({ level: 'error', message: `unknown runtime "${ref}"`, path: where });
    return ref ? runtimes[ref] : undefined;
  };
  for (const [aid, a] of Object.entries(agents)) runtimeOf(a.runtime, `agents.${aid}`);

  const layers: ResolvedLayer[] = [];
  const keys = new Set<string>();
  const layerIds = new Set<string>();

  for (const [index, l] of def.layers.entries()) {
    if (layerIds.has(l.id)) issues.push({ level: 'error', message: `duplicate layer id "${l.id}"`, path: `layers.${index}` });
    layerIds.add(l.id);
    const layer: ResolvedLayer = { id: l.id, index, title: l.title, description: l.description, nodes: [], edges: [] };

    for (const n of l.nodes) {
      const where = `${l.id}.${n.id}`;
      if (keys.has(where)) issues.push({ level: 'error', message: `duplicate node id "${n.id}"`, path: where });
      keys.add(where);
      const agent = n.agent ? agents[n.agent] : undefined;
      if (n.agent && !agent) issues.push({ level: 'error', message: `unknown agent "${n.agent}"`, path: where });
      const files = [...new Set([...(agent?.files ?? []), ...(n.files ?? [])])];
      for (const f of n.files ?? []) if (!exists(f)) issues.push({ level: 'warning', message: `file not found: ${f}`, path: where });
      const resources = [...(agent?.resources ?? []), ...(n.resources ?? [])];
      for (const r of n.resources ?? []) if (r.path && !exists(r.path)) issues.push({ level: 'warning', message: `resource not found: ${r.path}`, path: where });

      layer.nodes.push({
        id: n.id, key: where, layer: l.id,
        type: n.type ?? (n.agent ? 'agent' : 'process'),
        label: n.label ?? agent?.name ?? n.id,
        description: n.description ?? agent?.description,
        agent,
        model: n.model ?? agent?.model,
        prompt: (await resolvePromptRef(n.prompt, prompts, fs, issues, where)) ?? agent?.prompt,
        tools: n.tools ?? agent?.tools ?? [],
        files,
        tower: n.tower ?? agent?.tower,
        runtime: n.runtime ? runtimeOf(n.runtime, where) : agent?.runtime ? runtimes[agent.runtime] : undefined,
        status: n.status ?? 'active',
        resources,
        meta: n.meta ?? {},
      });
    }

    l.edges.forEach((e, i) => {
      const edge = toEdge(e, `${l.id}.e${i}`, (ref) => `${l.id}.${ref}`, keys, issues, `layers.${l.id}.edges.${i}`);
      if (edge) layer.edges.push(edge);
    });
    layers.push(layer);
  }

  const links: ResolvedEdge[] = [];
  def.links.forEach((e, i) => {
    const edge = toEdge(e, `link${i}`, (ref) => ref, keys, issues, `links.${i}`);
    if (edge) links.push(edge);
  });

  const connected = new Set([...layers.flatMap((l) => l.edges), ...links].flatMap((e) => [e.from, e.to]));
  for (const k of keys) if (!connected.has(k)) issues.push({ level: 'info', message: 'node has no connections', path: k });

  return { id, name: def.name, description: def.description, tags: def.tags, runtimes, layers, links, issues };
}

function toEdge(
  e: TowerDef['links'][number], id: string, qualify: (ref: string) => string,
  keys: Set<string>, issues: Issue[], where: string,
): ResolvedEdge | undefined {
  const parsed = parseEdge(e);
  if (typeof parsed === 'string') { issues.push({ level: 'error', message: parsed, path: where }); return; }
  const from = qualify(parsed.from);
  const to = qualify(parsed.to);
  for (const k of [from, to]) {
    if (!keys.has(k)) { issues.push({ level: 'error', message: `edge endpoint "${k}" does not exist`, path: where }); return; }
  }
  return { ...parsed, id, from, to };
}

/** Returns the absolute path if it is inside `root`, otherwise undefined. Guards the file API. */
export function safeJoin(root: string, path: string): string | undefined {
  const abs = resolve(root, path);
  return abs === root || abs.startsWith(root.endsWith(sep) ? root : root + sep) ? abs : undefined;
}
