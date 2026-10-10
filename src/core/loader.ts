import { readFile, realpath, stat } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import type { z } from 'zod';
import { TowerSchema, type TowerDef } from './schema.ts';
import { parseEdge } from './edges.ts';
import { isForbidden, isForbiddenSync, realOrSelf, userHome, within } from './secrets.ts';
import { pickOps, resolveAgent, resolvePromptDef, resolvePromptRef, type FileReader } from './resolve.ts';
import type { Issue, ResolvedAgent, ResolvedEdge, ResolvedLayer, ResolvedPrompt, ResolvedTower, Workspace } from './types.ts';

export interface LoadResult {
  workspace: Workspace;
  /** Tower id -> absolute root directory. Files may only be served from inside these. */
  roots: Map<string, string>;
  /** Every file the workspace depends on, for live reload. */
  watched: Set<string>;
  /** Referenced files that do not exist yet: creating one must reload (its warning goes away). */
  missing: Set<string>;
}

/** Node labels longer than this are cut with an ellipsis on the node card (`fit` in scene/LayerNodes.tsx). */
const MAX_LABEL = 18;
/** Nodes that open a nested tower lose room to the tower badge. */
const MAX_LABEL_NESTED = 13;

const QUOTE = 'Hint: quote the value ("...") when it contains ": ", or a comma inside a one-line map.';
/** YAML errors that almost always come from an unquoted ": " in a value. */
const QUOTE_HINT = new Set(['BLOCK_AS_IMPLICIT_KEY', 'BLOCK_IN_FLOW']);

/** `layers.6.nodes.3.approval` → `review.gate.approval`: ids, as the other issues use, instead of indexes to count. */
function readablePath(raw: unknown, path: PropertyKey[]): string {
  const [top, li, nodes, ni, ...rest] = path;
  const layer = top === 'layers' && typeof li === 'number' ? (raw as { layers?: { id?: unknown; nodes?: { id?: unknown }[] }[] })?.layers?.[li] : undefined;
  if (typeof layer?.id !== 'string') return path.map(String).join('.');
  const node = nodes === 'nodes' && typeof ni === 'number' ? layer.nodes?.[ni] : undefined;
  if (typeof node?.id === 'string') return [layer.id, node.id, ...rest].map(String).join('.');
  return ['layers', layer.id, ...path.slice(2)].map(String).join('.');
}

/**
 * Zod issues as tower issues, rewritten to point at the fix: a union that failed in every branch
 * reports the branch the value was meant for (`fanout: { by }` → `fanout.max` is required, not "Invalid input").
 */
function schemaIssues(list: readonly z.core.$ZodIssue[], raw: unknown, base: PropertyKey[] = []): Issue[] {
  return list.flatMap((e): Issue[] => {
    const path = [...base, ...e.path];
    if (e.code === 'invalid_union') {
      // Branches that failed only because the value has another type (a number vs a map) are not the one meant.
      const meant = e.errors.filter((b) => !(b.length === 1 && b[0].code === 'invalid_type' && !b[0].path.length));
      if (meant.length === 1) return schemaIssues(meant[0], raw, path);
    }
    let message = e.message;
    if (e.code === 'invalid_type' && message.endsWith('received undefined')) message = `required field missing (expected ${e.expected})`;
    // Real keys never contain spaces: this is the rest of a value that an unquoted comma cut off.
    if (e.code === 'unrecognized_keys' && e.keys.some((k) => /\s/.test(k))) message += `. ${QUOTE}`;
    return [{ level: 'error', message, path: readablePath(raw, path) }];
  });
}

/** Expands files and directories (scanned recursively) into a sorted list of tower files. */
export function findTowerFiles(entries: string[]): string[] {
  const out = new Set<string>();
  for (const entry of entries) {
    const abs = resolve(entry);
    if (!existsSync(abs)) continue;
    if (!statSync(abs).isDirectory()) { out.add(abs); continue; }
    // A symlink may lead out of the scanned folder (or into the user's own folder): those are not towers
    // of this entry. loadTower checks every file again before reading it.
    const realEntry = realOrSelf(abs);
    const home = userHome();
    if (within(home, abs) || within(realOrSelf(home), realEntry)) continue;
    for (const path of walk(abs, new Set())) {
      if (!within(realEntry, realOrSelf(path)) || isForbiddenSync(path)) continue;
      out.add(path);
    }
  }
  return [...out].sort();
}

/**
 * Tower files under `dir`, walked by hand: never into a symlinked folder (`a -> ..` three times made a
 * recursive readdir explode), nor a folder already seen, nor node_modules or hidden folders.
 */
function walk(dir: string, seen: Set<string>, out: string[] = []): string[] {
  const real = realOrSelf(dir);
  if (seen.has(real)) return out;
  seen.add(real);
  let items;
  try { items = readdirSync(dir, { withFileTypes: true }); } catch { return out; } // unreadable: skip it
  for (const d of items) {
    if (d.name === 'node_modules' || d.name.startsWith('.')) continue;
    const path = join(dir, d.name);
    if (d.isDirectory()) walk(path, seen, out);
    // A symlinked tower file is listed: findTowerFiles and loadTower check where it really leads.
    else if (d.name.endsWith('.tower.yaml') && (d.isFile() || d.isSymbolicLink())) out.push(path);
  }
  return out;
}

/**
 * The project a tower may read from: the git repository that contains it, else the folder that was
 * opened. A tower from a cloned repository must not pull ~/.ssh or ~/.aws into the workspace.
 */
export function projectOf(entry: string): string {
  const abs = resolve(entry);
  const start = statSync(abs).isDirectory() ? abs : dirname(abs);
  for (let d = start; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return start;
  }
}

/** Absolute path of `path` (relative to `root`) if it stays inside `project`, symlinks resolved. */
async function inside(project: string, root: string, path: string): Promise<string | undefined> {
  const abs = safeJoin(project, resolve(root, path));
  if (!abs) return undefined;
  // Symlinks are judged by their target. A missing file cannot be a symlink: report it as missing.
  const real = await realpath(abs).catch(() => undefined);
  return !real || safeJoin(await realpath(project), real) ? abs : undefined;
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
  // Each tower file belongs to the project of the entry it was found through; nested towers inherit it.
  const projects = new Map<string, string>();
  for (const entry of entries) {
    if (!existsSync(resolve(entry))) continue;
    const project = projectOf(entry);
    for (const f of findTowerFiles([entry])) if (!projects.has(f)) projects.set(f, project);
  }
  const base = files.length ? commonDir(files) : resolve('.');
  const result: LoadResult = {
    workspace: { projects: [], towers: {}, loadedAt: new Date().toISOString() },
    roots: new Map(),
    watched: new Set(),
    missing: new Set(),
  };
  const nestedIds = new Set<string>();
  const queue = [...files];
  while (queue.length) {
    const file = queue.shift()!;
    const id = toId(base, file);
    if (result.workspace.towers[id]) continue;
    const project = projects.get(file) ?? projectOf(file);
    const { tower, root, nested } = await loadTower(file, id, project, result.watched, result.missing);
    result.workspace.towers[id] = tower;
    result.roots.set(id, root);
    for (const n of nested) {
      if (!projects.has(n.abs)) projects.set(n.abs, project);
      const nid = toId(base, n.abs);
      if (nid !== id) nestedIds.add(nid);
      queue.push(n.abs);
      patchTowerRef(tower, n.ref, nid);
    }
  }
  const ids = files.map((f) => toId(base, f));
  const top = ids.filter((id) => !nestedIds.has(id));
  // Towers that only reference each other (a cycle) would all look nested: keep the first of each
  // group that no project reaches as a project too, or they vanish from the library.
  const reached = new Set<string>();
  const visit = (id: string) => {
    for (const n of result.workspace.towers[id]?.layers.flatMap((l) => l.nodes.flatMap((x) => [x.tower, x.agent?.tower])) ?? []) {
      if (n && !reached.has(n)) { reached.add(n); visit(n); }
    }
  };
  top.forEach(visit);
  for (const id of ids) if (!top.includes(id) && !reached.has(id)) { top.push(id); visit(id); }
  result.workspace.projects = ids.filter((id) => top.includes(id));
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

async function loadTower(file: string, id: string, project: string, watched: Set<string>, missing: Set<string>) {
  watched.add(file);
  const issues: Issue[] = [];
  const empty = (root: string) => ({
    tower: { id, name: id, tags: [], runtimes: {}, layers: [], links: [], issues } as ResolvedTower, root, nested: [],
  });

  const outside = (path: string) => issues.push({ level: 'error', message: `${path} is outside the project (${project}): not read` });
  const secret = (path: string) => issues.push({ level: 'error', message: `${path} is a secret file or in the user folder (~/.config/flow-tower): not read` });
  // The tower file itself, through symlinks: a repository could ship `x.tower.yaml -> ~/.config/flow-tower/
  // voice-journal.jsonl`, and YAML errors quote the lines they fail on.
  const real = await realpath(file).catch(() => undefined);
  if (real && !safeJoin(await realpath(project).catch(() => project), real)) { outside(file); return empty(dirname(file)); }
  if (real && await isForbidden(real, file)) { secret(file); return empty(dirname(file)); }

  let raw: string;
  try { raw = await readFile(file, 'utf8'); } catch {
    issues.push({ level: 'error', message: `tower file not found: ${file}` });
    return empty(dirname(file));
  }

  const doc = parseDocument(raw);
  if (doc.errors.length) {
    for (const e of doc.errors) issues.push({ level: 'error', message: e.message + (QUOTE_HINT.has(e.code) ? `\n${QUOTE}` : '') });
    return empty(dirname(file));
  }

  const input = doc.toJS();
  const parsed = TowerSchema.safeParse(input);
  if (!parsed.success) {
    issues.push(...schemaIssues(parsed.error.issues, input));
    return empty(dirname(file));
  }

  const def = parsed.data;
  let root = resolve(dirname(file), def.root ?? '.');
  if (!safeJoin(project, root)) {
    outside(`root ${def.root}`);
    root = dirname(file);
  }
  const fs: FileReader = {
    async read(path) {
      const abs = await inside(project, root, path);
      if (!abs) { outside(path); return undefined; }
      // A prompt or an agent file is shown in /api/workspace: never a key file, nor the user's journal.
      if (await isForbidden(await realpath(abs).catch(() => abs), path)) { secret(path); return undefined; }
      watched.add(abs);
      try { return await readFile(abs, 'utf8'); } catch { missing.add(abs); return undefined; }
    },
  };
  const tower = await buildTower(def, id, fs, issues, (p) => {
    const abs = safeJoin(project, resolve(root, p));
    if (!abs) { outside(p); return false; }
    if (isForbiddenSync(abs, p)) { secret(p); return false; } // not even whether it exists
    if (existsSync(abs)) return true;
    missing.add(abs);
    return false;
  });
  const refs = new Set(tower.layers.flatMap((l) => l.nodes.flatMap((n) => [n.tower, n.agent?.tower])).filter(Boolean) as string[]);
  const nested = [];
  for (const ref of refs) {
    const abs = await inside(project, root, ref);
    if (!abs) outside(`tower ${ref}`);
    else if (await isForbidden(await realpath(abs).catch(() => abs), ref)) secret(`tower ${ref}`);
    else nested.push({ ref, abs });
  }
  tower.updatedAt = await stat(file).then((st) => st.mtime.toISOString(), () => undefined);
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
  for (const [aid, a] of Object.entries(agents)) {
    runtimeOf(a.runtime, `agents.${aid}`);
    for (const r of a.resources) if (r.path && !exists(r.path)) issues.push({ level: 'warning', message: `resource not found: ${r.path}`, path: `agents.${aid}` });
  }

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

      const label = n.label ?? agent?.name ?? n.id;
      const max = n.tower ?? agent?.tower ? MAX_LABEL_NESTED : MAX_LABEL;
      if (label.length > max) issues.push({ level: 'warning', message: `label "${label}" has ${label.length} characters, the card shows ${max}${max === MAX_LABEL_NESTED ? ' (the nested-tower badge takes the rest)' : ''}: shorten it and move details to description`, path: where });

      layer.nodes.push({
        id: n.id, key: where, layer: l.id,
        type: n.type ?? (n.agent ? 'agent' : 'process'),
        label,
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
        match: n.match ?? agent?.match,
        ops: { ...agent?.ops, ...pickOps(n) },
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

  const run = def.budget || def.limits ? { budget: def.budget, limits: def.limits } : undefined;
  return { id, name: def.name, description: def.description, tags: def.tags, runtimes, run, layers, links, issues };
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
