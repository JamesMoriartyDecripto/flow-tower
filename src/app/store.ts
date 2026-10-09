import { create } from 'zustand';
import type { NodeType } from '../core/schema';
import type { ResolvedNode, ResolvedTower, Workspace } from '../core/types';

export type Quality = 'eco' | 'balanced' | 'high';

export interface OpenFile {
  tower: string;
  files: string[];
  index: number;
}

interface State {
  workspace?: Workspace;
  error?: string;
  /** Breadcrumb of tower ids, last one is on screen. */
  stack: string[];
  /** For each stack entry, the node of the tower above it that was used to enter it (several nodes can share a sub-tower). */
  owners: (string | undefined)[];
  /** Library (project gallery) overlay visible. */
  library: boolean;
  selected?: string;
  hovered?: string;
  focusedLayer?: number;
  /** Layer under the pointer: drives the lens (magnify + spread) effect in overview. */
  hoveredLayer?: number;
  explode: number;
  autoRotate: boolean;
  particles: boolean;
  quality: Quality;
  /** Decorative, always-moving effects (flow particles, scanner, sparkles, rotating base). */
  animations: boolean;
  /** Tower (stacked) or map (side by side, from above). */
  view: 'tower' | 'map';
  search: string;
  hiddenTypes: Set<NodeType>;
  /** Runtime id whose nodes are highlighted (everything else dims). */
  runtimeFocus?: string;
  file?: OpenFile;
  /** Bumped on every reload so the HUD can flash a "live" indicator. */
  revision: number;
  /** Bumped to re-run the overview camera move even if nothing else changed. */
  viewNonce: number;

  setWorkspace(ws: Workspace): void;
  setError(error?: string): void;
  select(key?: string): void;
  hover(key?: string): void;
  focusLayer(index?: number): void;
  /** Pass undefined to leave: cleared after a short delay so moving onto a node does not flicker. */
  hoverLayer(index?: number): void;
  resetView(): void;
  enterTower(id: string): void;
  openProject(id: string): void;
  /** Jump to a tower by breadcrumb (project → … → tower) and optionally select a node there. */
  openPath(stack: string[], select?: string): void;
  showLibrary(open: boolean): void;
  goTo(depth: number): void;
  set(patch: Partial<Pick<State, 'explode' | 'autoRotate' | 'particles' | 'search' | 'quality' | 'animations' | 'view' | 'runtimeFocus'>>): void;
  toggleType(type: NodeType): void;
  openFile(file?: OpenFile): void;
}

function initialQuality(): Quality {
  const q = new URLSearchParams(location.search).get('quality');
  return q === 'low' ? 'eco' : q === 'eco' || q === 'high' || q === 'balanced' ? q : 'balanced';
}

let leaveTimer: ReturnType<typeof setTimeout> | undefined;

const signatures = new WeakMap<ResolvedTower, string>();
const signature = (t: ResolvedTower) => {
  let s = signatures.get(t);
  if (s === undefined) signatures.set(t, (s = JSON.stringify(t)));
  return s;
};
/**
 * Any watched file change reloads the whole library: keep the previous object of every tower that
 * did not change, so its layout (ELK) and its layers are not recomputed and re-rendered.
 */
function share(prev: Workspace | undefined, next: Workspace): Workspace {
  if (!prev) return next;
  const towers = Object.fromEntries(Object.entries(next.towers).map(([id, t]) => {
    const old = prev.towers[id];
    return [id, old && signature(old) === signature(t) ? old : t];
  }));
  return { ...next, towers };
}

export const useStore = create<State>()((set, get) => ({
  stack: [],
  owners: [],
  library: false,
  explode: 1,
  autoRotate: false,
  particles: true,
  quality: initialQuality(),
  animations: true,
  view: new URLSearchParams(location.search).get('view') === 'map' ? 'map' : 'tower',
  search: '',
  hiddenTypes: new Set(),
  revision: 0,
  viewNonce: 0,

  setWorkspace(incoming) {
    const ws = share(get().workspace, incoming);
    // Keep the user where they are on live reload, unless that tower disappeared.
    const first = !get().workspace;
    const stack = get().stack.filter((id) => ws.towers[id]);
    // The edit may have removed the selected node, the focused layer or the tower on screen.
    const tower = ws.towers[stack.at(-1) ?? ''];
    const moved = stack.length !== get().stack.length || !tower;
    const { selected, focusedLayer, file } = get();
    const nodeGone = selected !== undefined && !tower?.layers.some((l) => l.nodes.some((n) => n.key === selected));
    set({
      workspace: ws,
      error: undefined,
      selected: moved || nodeGone ? undefined : selected,
      focusedLayer: moved || (focusedLayer ?? 0) >= (tower?.layers.length ?? 0) ? undefined : focusedLayer,
      file: file && ws.towers[file.tower] && !moved ? file : undefined,
      stack: stack.length ? stack : ws.projects.slice(0, 1),
      owners: moved ? [] : get().owners,
      library: first ? ws.projects.length > 1 : get().library,
      revision: get().revision + 1,
    });
  },
  setError: (error) => set({ error }),
  select: (selected) => set({ selected }),
  hover: (hovered) => set({ hovered }),
  focusLayer: (focusedLayer) => set({ focusedLayer, hoveredLayer: undefined }),
  hoverLayer(index) {
    clearTimeout(leaveTimer);
    if (index === undefined) leaveTimer = setTimeout(() => set({ hoveredLayer: undefined }), 140);
    else if (get().hoveredLayer !== index) set({ hoveredLayer: index });
  },
  resetView: () => set({ focusedLayer: undefined, viewNonce: get().viewNonce + 1 }),
  enterTower(id) {
    if (!get().workspace?.towers[id]) return;
    set({ stack: [...get().stack, id], owners: [...get().stack.map((_, i) => get().owners[i]), get().selected], selected: undefined, focusedLayer: undefined, hoveredLayer: undefined, file: undefined, runtimeFocus: undefined });
  },
  openProject(id) {
    set({ stack: [id], owners: [], library: false, selected: undefined, focusedLayer: undefined, hoveredLayer: undefined, file: undefined, search: '', runtimeFocus: undefined });
  },
  openPath(stack, select) {
    set({ stack, owners: [], library: false, selected: select, focusedLayer: undefined, hoveredLayer: undefined, file: undefined, runtimeFocus: undefined });
  },
  showLibrary: (library) => set({ library }),
  goTo(depth) {
    const { stack, owners, workspace } = get();
    // The current tower's own crumb: nothing to leave, keep the selection.
    if (depth >= stack.length - 1) return;
    // Coming back up: land on the node that opens the tower we leave, so the user is where they left.
    const child = stack[depth + 1];
    const parent = workspace?.towers[stack[depth]];
    const opens = (n: { tower?: string; agent?: { tower?: string } }) => n.tower === child || n.agent?.tower === child;
    const candidates = parent?.layers.flatMap((l, i) => l.nodes.filter(opens).map((n) => ({ key: n.key, i }))) ?? [];
    // Prefer the node the user entered from; else the first node that opens the tower we leave.
    const back = candidates.find((c) => c.key === owners[depth + 1]) ?? candidates[0];
    // A runtime spotlight belongs to the tower it was set in; the parent may not even have that runtime.
    set({ stack: stack.slice(0, depth + 1), owners: owners.slice(0, depth + 1), selected: back?.key, focusedLayer: back?.i, hoveredLayer: undefined, file: undefined, runtimeFocus: undefined });
  },
  set: (patch) => set(patch),
  toggleType(type) {
    const hiddenTypes = new Set(get().hiddenTypes);
    if (!hiddenTypes.delete(type)) hiddenTypes.add(type);
    set({ hiddenTypes });
  },
  openFile: (file) => set({ file }),
}));

export const useTower = (): ResolvedTower | undefined =>
  useStore((s) => s.workspace?.towers[s.stack[s.stack.length - 1]]);

export function findNode(tower: ResolvedTower | undefined, key?: string): ResolvedNode | undefined {
  if (!tower || !key) return undefined;
  for (const l of tower.layers) for (const n of l.nodes) if (n.key === key) return n;
}
