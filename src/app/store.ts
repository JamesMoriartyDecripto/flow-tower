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

export const useStore = create<State>()((set, get) => ({
  stack: [],
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

  setWorkspace(ws) {
    // Keep the user where they are on live reload, unless that tower disappeared.
    const first = !get().workspace;
    const stack = get().stack.filter((id) => ws.towers[id]);
    set({
      workspace: ws,
      error: undefined,
      stack: stack.length ? stack : ws.projects.slice(0, 1),
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
    set({ stack: [...get().stack, id], selected: undefined, focusedLayer: undefined, hoveredLayer: undefined, file: undefined, runtimeFocus: undefined });
  },
  openProject(id) {
    set({ stack: [id], library: false, selected: undefined, focusedLayer: undefined, hoveredLayer: undefined, file: undefined, search: '', runtimeFocus: undefined });
  },
  openPath(stack, select) {
    set({ stack, library: false, selected: select, focusedLayer: undefined, hoveredLayer: undefined, file: undefined });
  },
  showLibrary: (library) => set({ library }),
  goTo(depth) {
    set({ stack: get().stack.slice(0, depth + 1), selected: undefined, focusedLayer: undefined, hoveredLayer: undefined, file: undefined });
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
