import { NODE_TYPES } from '../../core/schema';
import type { ResolvedNode, ResolvedTower, Workspace } from '../../core/types';
import { fetchFile } from '../api';
import { allEdges, towerPath } from '../graph';
import { flowOrder } from '../keynav';
import { LIBRARY_FILTER_EVENT, matchingProjects, type LibraryFilter } from '../library';
import { opsMarks } from '../ops';
import { chooseView } from '../settings';
import { findNode, useStore } from '../store';
import { useHub } from '../hud/Hub';
import { SCROLL_EVENT } from './actions';
import { norm, nodeTypeOf, score } from './commands';
import { currentList, setList } from './referents';

/**
 * What the voice agent can read and do. The tools run here, in the page, on the workspace on screen,
 * so answers are true to the tower and actions use the same store calls as the keyboard. Read tools
 * return compact JSON; act tools change the view and say what they did.
 * "this node" / "this layer" is the selection: node and layer arguments may be omitted.
 */
export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

const str = (description: string) => ({ type: 'string', description });
const tool = (name: string, description: string, properties: Record<string, object> = {}, required: string[] = []): ToolDef =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });

const NODE = str('Node name as the user says it ("triage", "fresh verifier"), its label, agent name or key "layer.node". Searches the tower on screen, then the library. Omit for the selected node.');
const LAYER = str('Layer number (1 = top), id or title. Omit for the focused layer.');

export const TOOLS: ToolDef[] = [
  tool('screen', 'What is on screen now: library or tower, focused layer, selected node, open file.'),
  tool('list_layers', 'The layers of the tower on screen, top to bottom, with how many nodes each has.'),
  tool('layer_nodes', 'The nodes of one layer in flow order, with type and a short description, and its flow: the edges inside the layer. Enough to explain what a layer does and how.', { layer: LAYER }),
  tool('search', 'Find nodes anywhere in the tower on screen by words in their label, type, description or tools ("MCP", "human approval", "database"), best matches first, and highlight them on screen. For questions about the whole tower.', { query: str('Words to look for.') }, ['query']),
  tool('node_info', 'Everything about one node: type, layer, description, agent, model, tools, runtime, operations, status, sub-tower.', { node: NODE }),
  tool('connections', 'Incoming and outgoing edges of a node: the other node, its layer, the edge kind and label.', { node: NODE }),
  tool('compare_nodes', 'Two nodes side by side, to say what is the same and what differs: label, type, layer, agent, model, runtime, tools, file count and incoming/outgoing edge counts, then "same" (the equal fields) and "only_a"/"only_b" (tools one has and the other has not).', { a: str('First node, named as in node_info.'), b: str('Second node, named as in node_info.') }, ['a', 'b']),
  tool('node_files', 'The files and resources a node references, numbered from 1.', { node: NODE }),
  tool('focus_layer', 'Show one layer on screen.', { layer: LAYER }),
  tool('select_node', 'Select a node: the camera goes to it and its panel opens.', { node: NODE }),
  tool('open_file', 'Open one of a node\'s files in the viewer.', { node: NODE, index: { type: 'integer', description: 'File number from node_files, 1 = first.' } }, ['index']),
  tool('read_file', 'Read a file to explain it: the one open in the viewer, or file number index of a node (it is opened on screen too). Returns its text, cut after about 8000 characters.', { node: NODE, index: { type: 'integer', description: 'File number from node_files, 1 = first. Omit for the file open now.' } }),
  tool('close_file', 'Close the file viewer. The selected node and the view stay as they are.'),
  tool('scroll_file', 'Scroll the file open in the viewer: down/up one page, or to the top/bottom. Needs a file open.', { to: { type: 'string', enum: ['down', 'up', 'top', 'bottom'] } }, ['to']),
  tool('hub_panel', 'Open the Hub panel on a tab (now/machines) or close it. Only works on a hub page.', { tab: { type: 'string', enum: ['now', 'machines', 'close'] } }, ['tab']),
  tool('filter_nodes', `Show only some node types on screen (the legend's type filter). Valid types: ${NODE_TYPES.join(', ')}. An empty or absent list shows every type again.`, { types: { type: 'array', items: { type: 'string' }, description: 'Node types to keep visible; the others are hidden.' } }),
  tool('library_filter', 'Open the project library and filter it: a text query (name, description, tag or model) and/or a tag. Both are set; an absent one is cleared. Returns how many projects match.', { query: str('Words to match against project name, description, tag or model.'), tag: str('Show only projects carrying this tag.') }),
  tool('open_project', 'Open a project or a sub-tower by name.', { name: str('Project or tower name.') }, ['name']),
  tool('navigate', 'Move the view. back = like Esc: closes the open file first, else deselects the node, else leaves the layer, else goes up one tower, else opens the library.', { to: { type: 'string', enum: ['library', 'overview', 'back', 'map', 'tower', 'enter_sub_tower'] } }, ['to']),
];

type Args = Record<string, unknown>;
const view = () => {
  const s = useStore.getState();
  const ws = s.workspace!;
  return { s, ws, tower: ws.towers[s.stack[s.stack.length - 1]] as ResolvedTower | undefined };
};

function layerOf(tower: ResolvedTower, ref: unknown): number | undefined {
  const s = useStore.getState();
  if (ref === undefined || ref === '') return s.focusedLayer ?? (s.selected ? tower.layers.findIndex((l) => l.nodes.some((n) => n.key === s.selected)) : undefined);
  const n = Number(String(ref).replace(/^l0*/i, ''));
  if (Number.isInteger(n) && n >= 1 && n <= tower.layers.length) return n - 1;
  const words = norm(String(ref)).split(' ').filter(Boolean);
  const best = tower.layers.map((l, i) => ({ i, s: Math.max(score(words, l.title), score(words, l.id), l.id === ref ? 1 : 0) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s >= 0.5 ? best.i : undefined;
}

function nodeOf(ws: Workspace, tower: ResolvedTower | undefined, ref: unknown): { t: ResolvedTower; n: ResolvedNode } | undefined {
  const s = useStore.getState();
  if (ref === undefined || ref === '') {
    const n = findNode(tower, s.selected);
    return n && tower ? { t: tower, n } : undefined;
  }
  const key = String(ref);
  // The tower on screen first, then the rest of the library.
  const towers = [tower, ...Object.values(ws.towers).filter((t) => t !== tower)].filter(Boolean) as ResolvedTower[];
  for (const t of towers) { const n = findNode(t, key); if (n) return { t, n }; }
  // The model may write a name as an id ("fresh_verifier") or with its layer ("quality.verifier").
  const words = norm(key.replace(/^[\w-]+\./, '')).split(' ').filter(Boolean);
  for (const t of towers) {
    const ranked = t.layers.flatMap((l) => l.nodes).map((n) => ({ n, s: Math.max(score(words, n.label), score(words, n.id), n.agent ? score(words, n.agent.name) : 0) }))
      .sort((a, b) => b.s - a.s);
    if (ranked[0]?.s >= 0.6) return { t, n: ranked[0].n };
  }
}

const brief = (text?: string, max = 140) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);
const layerTitle = (t: ResolvedTower, key: string) => t.layers.find((l) => l.nodes.some((n) => n.key === key))?.title;

/** The comparable face of a node: what compare_nodes puts side by side, per node. */
function faceOf(t: ResolvedTower, n: ResolvedNode) {
  const edges = allEdges(t);
  return {
    label: n.label, type: n.type, layer: layerTitle(t, n.key), agent: n.agent?.name, model: n.model,
    runtime: n.runtime && `${n.runtime.label ?? n.runtime.id} (${n.runtime.kind})`,
    tools: n.tools, files: n.files.length,
    incoming: edges.filter((e) => e.to === n.key).length,
    outgoing: edges.filter((e) => e.from === n.key).length,
  };
}

function show(t: ResolvedTower, key: string) {
  const { s, ws, tower } = view();
  if (s.library) s.showLibrary(false);
  if (t.id !== tower?.id) { const path = towerPath(ws, t.id); if (path) s.openPath(path, key); } else s.select(key);
  useStore.getState().focusLayer(t.layers.findIndex((l) => l.nodes.some((n) => n.key === key)));
}

/** Runs one tool call; always returns JSON text, errors included, so the model can recover. */
export function runTool(name: string, args: Args): string {
  const { s, ws, tower } = view();
  const out = (v: unknown) => JSON.stringify(v);
  const noTower = out({ error: 'No tower is open. Ask which project to open, or use open_project.' });
  switch (name) {
    case 'screen': {
      const n = findNode(tower, s.selected);
      const l = s.focusedLayer !== undefined ? tower?.layers[s.focusedLayer] : undefined;
      // The list the parser would step through on "il prossimo" (#130): the agent needs it to answer
      // "the next one" about the same list the user is walking, not one it invents.
      const list = currentList(tower?.id);
      return out({
        library_open: s.library,
        projects: ws.projects.map((id) => ws.towers[id].name),
        tower: tower && { name: tower.name, layers: tower.layers.length },
        focused_layer: l && { number: l.index + 1, title: l.title },
        selected_node: n && { key: n.key, label: n.label },
        open_file: s.file ? s.file.files[s.file.index] : undefined,
        list: list && { source: list.source, count: list.keys.length, position: list.cursor >= 0 ? list.cursor + 1 : undefined },
        view: s.view,
      });
    }
    case 'list_layers':
      if (!tower) return noTower;
      return out(tower.layers.map((l) => ({ number: l.index + 1, title: l.title, nodes: l.nodes.length, description: brief(l.description) })));
    case 'layer_nodes': {
      if (!tower) return noTower;
      const i = layerOf(tower, args.layer);
      if (i === undefined) return out({ error: `No layer "${args.layer ?? ''}". Use list_layers.` });
      const l = tower.layers[i];
      // Flow order is the layout's left to right, as on screen (and in the node list panel).
      const nodes = flowOrder(tower.id, l);
      const label = (key: string) => findNode(tower, key)?.label ?? key;
      const keys = new Set(l.nodes.map((n) => n.key));
      // The layer's nodes in flow order become the list too: "il prossimo" walks the flow just shown.
      setList({ tower: tower.id, keys: nodes.map((n) => n.key), cursor: -1, source: 'layer' });
      // The edges inside the layer are its flow: one call is enough to explain it.
      return out({
        layer: { number: i + 1, title: l.title, description: l.description },
        nodes: nodes.map((n) => ({ key: n.key, label: n.label, type: n.type, status: n.status === 'active' ? undefined : n.status, description: brief(n.description, 100), sub_tower: n.tower ? ws.towers[n.tower]?.name : undefined })),
        flow: l.edges.map((e) => ({ from: label(e.from), to: label(e.to), kind: e.kind, label: e.label })),
        links_in: tower.links.filter((e) => keys.has(e.to) && !keys.has(e.from)).length,
        links_out: tower.links.filter((e) => keys.has(e.from) && !keys.has(e.to)).length,
      });
    }
    case 'search': {
      if (!tower) return noTower;
      const words = norm(String(args.query ?? '')).split(' ').filter((w) => w.length > 1);
      const text = (n: ResolvedNode) => norm([n.label, n.id, n.type, n.description, n.agent?.name, ...n.tools].filter(Boolean).join(' '));
      // Any word counts, best matches first: "human approval" finds the human nodes and the approvals.
      const hits = tower.layers.flatMap((l) => l.nodes.map((n) => ({ n, l, k: words.filter((w) => text(n).includes(w)).length })))
        .filter((h) => h.k > 0).sort((a, b) => b.k - a.k)
        .map(({ n, l, k }) => ({ key: n.key, label: n.label, type: n.type, layer: l.title, matched: k === words.length ? 'all words' : 'some words' }));
      // The top bar search highlights the matches in the scene, so "they are highlighted" is true.
      agentSearch = String(args.query ?? '');
      s.set({ search: agentSearch });
      // The hits become the list: "il prossimo" then steps through them, cursor at -1 so it picks the first.
      setList({ tower: tower.id, keys: hits.map((h) => h.key), cursor: -1, source: 'search' });
      return out({ query: args.query, count: hits.length, nodes: hits.slice(0, 25), highlighted_on_screen: true });
    }
    case 'node_info': {
      const hit = nodeOf(ws, tower, args.node);
      if (!hit) return out({ error: 'No such node; nothing is selected either. Use layer_nodes to find it.' });
      const { t, n } = hit;
      return out({
        key: n.key, label: n.label, type: n.type, layer: layerTitle(t, n.key), tower: t.name, status: n.status,
        description: n.description, agent: n.agent?.name, model: n.model, prompt: n.prompt?.source, tools: n.tools.length ? n.tools : undefined,
        runtime: n.runtime && `${n.runtime.label ?? n.runtime.id} (${n.runtime.kind})`, operations: opsMarks(n.ops), files: n.files.length,
        sub_tower: n.tower ? ws.towers[n.tower]?.name : undefined,
      });
    }
    case 'compare_nodes': {
      const a = nodeOf(ws, tower, args.a);
      if (!a) return out({ error: `No node "${args.a ?? ''}". Use layer_nodes to find it.` });
      const b = nodeOf(ws, tower, args.b);
      if (!b) return out({ error: `No node "${args.b ?? ''}". Use layer_nodes to find it.` });
      const fa = faceOf(a.t, a.n);
      const fb = faceOf(b.t, b.n);
      const setA = new Set(fa.tools);
      const setB = new Set(fb.tools);
      // Tools compare as sets, so an order difference is not reported as a difference.
      const equal = (k: keyof typeof fa) => k === 'tools'
        ? fa.tools.length === fb.tools.length && fa.tools.every((t) => setB.has(t))
        : fa[k] === fb[k];
      const fields = Object.keys(fa) as (keyof typeof fa)[];
      return out({
        a: fa, b: fb, same: fields.filter(equal),
        only_a: fa.tools.filter((t) => !setB.has(t)),
        only_b: fb.tools.filter((t) => !setA.has(t)),
      });
    }
    case 'connections': {
      const hit = nodeOf(ws, tower, args.node);
      if (!hit) return out({ error: 'No such node; nothing is selected either.' });
      const { t, n } = hit;
      const other = (key: string) => ({ node: findNode(t, key)?.label ?? key, layer: layerTitle(t, key) });
      const edges = allEdges(t);
      return out({
        node: n.label,
        incoming: edges.filter((e) => e.to === n.key).map((e) => ({ from: other(e.from), kind: e.kind, label: e.label })),
        outgoing: edges.filter((e) => e.from === n.key).map((e) => ({ to: other(e.to), kind: e.kind, label: e.label })),
      });
    }
    case 'node_files': {
      const hit = nodeOf(ws, tower, args.node);
      if (!hit) return out({ error: 'No such node; nothing is selected either.' });
      const files = filesOf(hit.n);
      return out({ node: hit.n.label, files: files.map((f, i) => ({ number: i + 1, path: f })) });
    }
    case 'focus_layer': {
      if (!tower) return noTower;
      const i = layerOf(tower, args.layer);
      if (i === undefined) return out({ error: `No layer "${args.layer ?? ''}".` });
      if (s.library) s.showLibrary(false);
      s.select(undefined);
      s.focusLayer(i);
      return out({ shown: `L${i + 1} ${tower.layers[i].title}` });
    }
    case 'select_node': {
      const hit = nodeOf(ws, tower, args.node);
      if (!hit) return out({ error: `No node "${args.node ?? ''}".` });
      show(hit.t, hit.n.key);
      // Selecting a node of the list in play moves its cursor there (#130), so a later "il prossimo"
      // continues from the node the user just picked instead of restarting at the first hit.
      const list = currentList(hit.t.id);
      const at = list?.keys.indexOf(hit.n.key) ?? -1;
      if (list && at >= 0) setList({ ...list, cursor: at });
      return out({ selected: hit.n.label, layer: layerTitle(hit.t, hit.n.key), tower: hit.t.name });
    }
    case 'open_file': {
      const hit = nodeOf(ws, tower, args.node);
      if (!hit) return out({ error: 'No such node; nothing is selected either.' });
      const files = filesOf(hit.n);
      const i = Number(args.index) - 1;
      if (!files[i]) return out({ error: `The node has ${files.length} file(s).` });
      show(hit.t, hit.n.key);
      useStore.getState().openFile({ tower: hit.t.id, files, index: i });
      return out({ opened: files[i] });
    }
    case 'close_file': {
      if (!s.file) return out({ error: 'No file is open.' });
      const closed = s.file.files[s.file.index];
      s.openFile(undefined);
      return out({ closed });
    }
    case 'scroll_file': {
      const to = String(args.to);
      if (!['down', 'up', 'top', 'bottom'].includes(to)) return out({ error: `Unknown scroll target "${to}".` });
      if (!s.file) return out({ error: 'No file is open. Open one with open_file first.' });
      // Same event the parser's scroll action sends (#145b): the viewer does the scrolling.
      window.dispatchEvent(new CustomEvent(SCROLL_EVENT, { detail: to }));
      return out({ scrolled: to });
    }
    case 'hub_panel': {
      const tab = String(args.tab);
      if (!['now', 'machines', 'close'].includes(tab)) return out({ error: `Unknown hub tab "${tab}".` });
      const hub = useHub.getState();
      if (tab === 'close') { hub.close(); return out({ closed: true }); }
      if (hub.me?.hub === false) return out({ error: 'This page is not on a hub.' });
      hub.show(tab as 'now' | 'machines');
      return out({ shown: tab });
    }
    case 'open_project': {
      const words = norm(String(args.name ?? '')).split(' ').filter(Boolean);
      const best = Object.values(ws.towers).map((t) => ({ t, s: score(words, t.name) })).sort((a, b) => b.s - a.s)[0];
      const path = best && best.s >= 0.5 ? towerPath(ws, best.t.id) : undefined;
      if (!path) return out({ error: `No project "${args.name}".`, projects: ws.projects.map((id) => ws.towers[id].name) });
      s.openPath(path);
      return out({ opened: best.t.name });
    }
    case 'filter_nodes': {
      const asked = (Array.isArray(args.types) ? args.types : []).map((t) => String(t).trim()).filter(Boolean);
      const only = asked.map((name) => nodeTypeOf(name));
      // A type the model invented would silently show nothing: refuse and list what is valid.
      const unknown = asked.filter((_, i) => only[i] === undefined);
      if (unknown.length) return out({ error: `Unknown node type(s): ${unknown.join(', ')}.`, types: NODE_TYPES });
      const types = only.filter((t) => t !== undefined);
      useStore.getState().showOnlyTypes(types.length ? types : undefined);
      return out({ showing: types.length ? types : 'every type' });
    }
    case 'library_filter': {
      const filter: LibraryFilter = { ...(args.query !== undefined && { query: String(args.query) }), ...(args.tag !== undefined && { tag: String(args.tag) }) };
      const count = matchingProjects(ws, filter).length;
      s.showLibrary(true);
      // If the Library is mounting now (it was closed), it attaches its listener on the next frame:
      // dispatching later is what makes the tool's filter the panel's own state (#145c).
      const frame: (fn: () => void) => unknown = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
      frame(() => window.dispatchEvent(new CustomEvent<LibraryFilter>(LIBRARY_FILTER_EVENT, { detail: filter })));
      return out({ projects: count, query: filter.query, tag: filter.tag });
    }
    case 'navigate': {
      switch (args.to) {
        case 'library': s.showLibrary(true); break;
        case 'overview': s.showLibrary(false); s.select(undefined); s.resetView(); break;
        case 'map': case 'tower': chooseView(args.to); break;
        case 'enter_sub_tower': {
          const n = findNode(tower, s.selected);
          if (!n?.tower) return out({ error: 'The selected node has no sub-tower.' });
          s.enterTower(n.tower);
          break;
        }
        default:
          if (s.file) s.openFile(undefined);
          else if (s.selected) s.select(undefined);
          else if (s.focusedLayer !== undefined) s.resetView();
          else if (s.stack.length > 1) s.goTo(s.stack.length - 2);
          else s.showLibrary(true);
      }
      return out({ done: args.to });
    }
  }
  return out({ error: `Unknown tool ${name}` });
}

/** Files first, then resources with a path: the order node_files numbers them in. */
const filesOf = (n: ResolvedNode) => [...n.files, ...n.resources.filter((r) => r.path && !n.files.includes(r.path)).map((r) => r.path!)];

const MAX_FILE_CHARS = 8000;

/** read_file needs the network (/api/file, same guards as the viewer); every other tool is synchronous. */
export async function runToolAsync(name: string, args: Args): Promise<string> {
  if (name !== 'read_file') return runTool(name, args);
  const { s, ws, tower } = view();
  let target = s.file && args.index === undefined && args.node === undefined ? { tower: s.file.tower, path: s.file.files[s.file.index] } : undefined;
  if (!target) {
    const hit = nodeOf(ws, tower, args.node);
    if (!hit) return JSON.stringify({ error: 'No file is open and no node is selected: name the node, or open a file first.' });
    const files = filesOf(hit.n);
    const i = Number(args.index ?? 1) - 1;
    if (!files[i]) return JSON.stringify({ error: `The node has ${files.length} file(s).` });
    show(hit.t, hit.n.key);
    useStore.getState().openFile({ tower: hit.t.id, files, index: i });
    target = { tower: hit.t.id, path: files[i] };
  }
  try {
    const f = await fetchFile(target.tower, target.path);
    return JSON.stringify({
      path: f.path, type: f.ext, lines: f.content.split('\n').length,
      truncated: f.content.length > MAX_FILE_CHARS || undefined, content: f.content.slice(0, MAX_FILE_CHARS),
    });
  } catch (err) {
    return JSON.stringify({ error: `Cannot read ${target.path}: ${(err as Error).message}` });
  }
}

/** The highlight the search tool set; cleared on the next turn unless the user typed their own search. */
let agentSearch = '';
export function clearAgentSearch() {
  const s = useStore.getState();
  if (agentSearch && s.search === agentSearch) s.set({ search: '' });
  agentSearch = '';
}
