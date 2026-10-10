import type { ResolvedNode, ResolvedTower, Workspace } from '../../core/types';
import { fetchFile } from '../api';
import { allEdges, towerPath } from '../graph';
import { layoutOf } from '../keynav';
import { opsMarks } from '../ops';
import { chooseView } from '../settings';
import { findNode, useStore } from '../store';
import { norm, score } from './commands';

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
  tool('node_files', 'The files and resources a node references, numbered from 1.', { node: NODE }),
  tool('focus_layer', 'Show one layer on screen.', { layer: LAYER }),
  tool('select_node', 'Select a node: the camera goes to it and its panel opens.', { node: NODE }),
  tool('open_file', 'Open one of a node\'s files in the viewer.', { node: NODE, index: { type: 'integer', description: 'File number from node_files, 1 = first.' } }, ['index']),
  tool('read_file', 'Read a file to explain it: the one open in the viewer, or file number index of a node (it is opened on screen too). Returns its text, cut after about 8000 characters.', { node: NODE, index: { type: 'integer', description: 'File number from node_files, 1 = first. Omit for the file open now.' } }),
  tool('open_project', 'Open a project or a sub-tower by name.', { name: str('Project or tower name.') }, ['name']),
  tool('navigate', 'Move the view.', { to: { type: 'string', enum: ['library', 'overview', 'back', 'map', 'tower', 'enter_sub_tower'] } }, ['to']),
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
      return out({
        library_open: s.library,
        projects: ws.projects.map((id) => ws.towers[id].name),
        tower: tower && { name: tower.name, layers: tower.layers.length },
        focused_layer: l && { number: l.index + 1, title: l.title },
        selected_node: n && { key: n.key, label: n.label },
        open_file: s.file ? s.file.files[s.file.index] : undefined,
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
      const boxes = layoutOf(tower.id)?.layers[i]?.nodes;
      const nodes = boxes ? [...l.nodes].sort((a, b) => (boxes[a.key]?.x ?? 0) - (boxes[b.key]?.x ?? 0) || (boxes[a.key]?.z ?? 0) - (boxes[b.key]?.z ?? 0)) : l.nodes;
      const label = (key: string) => findNode(tower, key)?.label ?? key;
      const keys = new Set(l.nodes.map((n) => n.key));
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
    case 'open_project': {
      const words = norm(String(args.name ?? '')).split(' ').filter(Boolean);
      const best = Object.values(ws.towers).map((t) => ({ t, s: score(words, t.name) })).sort((a, b) => b.s - a.s)[0];
      const path = best && best.s >= 0.5 ? towerPath(ws, best.t.id) : undefined;
      if (!path) return out({ error: `No project "${args.name}".`, projects: ws.projects.map((id) => ws.towers[id].name) });
      s.openPath(path);
      return out({ opened: best.t.name });
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
