/**
 * The list the user was last shown, so a follow-up like "il prossimo" / "the next one" knows what
 * "next" refers to. The voice agent writes a list when it shows one (a search result, a layer's
 * nodes) and steps through it on the next turn.
 *
 * The state is one module variable, replaced on every change and never mutated in place: a step can
 * never leave a reader looking at a half-updated list.
 */

import type { ResolvedNode, ResolvedTower } from '../../core/types';
import { flowOrder } from '../keynav';
import { findNode, useStore } from '../store';

export type ListRef = {
  /** Id of the tower the list belongs to: a list from another tower means nothing on screen now. */
  tower: string;
  /** Node keys in the order they were shown. */
  keys: string[];
  /** Position in `keys` the user is on; -1 before the first step. */
  cursor: number;
  source: 'search' | 'layer';
};

let list: ListRef | undefined;

export function setList(ref: ListRef) {
  list = { ...ref, keys: [...ref.keys] };
}

/**
 * Drops the list. Internal, not exported: every reader already treats a stale list as no list
 * (currentList below for another tower, runStep for a key the live reload removed), so nothing else
 * has to clear eagerly. Clearing from voice.ts's store subscription was the alternative, but that
 * subscription fires on `selected` too, and pick() changes the selection on every step — it would
 * drop the list mid-walk. The lazy checks are what keeps stepping correct.
 */
function clearList() {
  list = undefined;
}

/**
 * The list on screen, or nothing. A list kept for another tower is stale (the caller passes the tower
 * id now on screen), so it is dropped rather than handed to the agent as if it were still visible.
 * Dropping here and in runStep is why no eager clear is needed when the workspace moves on.
 */
export function currentList(tower?: string): ListRef | undefined {
  if (!list) return undefined;
  if (tower !== undefined && list.tower !== tower) {
    list = undefined;
    return undefined;
  }
  return list;
}

/** The cursor after moving one step: undefined past either end (no wrap-around). */
export function stepIndex(length: number, cursor: number, dir: 1 | -1): number | undefined {
  const next = cursor + dir;
  return next < 0 || next >= length ? undefined : next;
}

/** Move one step in the current list and return the key there; undefined at the end or with no list. */
export function stepList(dir: 1 | -1): string | undefined {
  const ref = list;
  if (!ref) return undefined;
  const next = stepIndex(ref.keys.length, ref.cursor, dir);
  if (next === undefined) return undefined;
  list = { ...ref, cursor: next };
  return ref.keys[next];
}

/** The tower on screen, if the workspace has loaded one. */
const towerNow = () => {
  const s = useStore.getState();
  return s.workspace?.towers[s.stack[s.stack.length - 1]];
};

/** Files first, then resources with a path: the order the viewer's file tabs and the agent's tools use. */
const filesOf = (n: ResolvedNode) => [...n.files, ...n.resources.filter((r) => r.path && !n.files.includes(r.path)).map((r) => r.path!)];

/** Selects a node of `tower` and focuses its layer: the same calls the keyboard and voice selection make. */
function pick(tower: ResolvedTower, key: string) {
  const s = useStore.getState();
  const li = tower.layers.findIndex((l) => l.nodes.some((n) => n.key === key));
  s.select(key);
  if (li >= 0 && s.focusedLayer !== li) s.focusLayer(li);
}

/**
 * "apri il suo file" / "open its file" (#130): opens file `index` (0-based) of the selected node in the
 * viewer. Past the end the caption says how many there are instead of opening the wrong file.
 */
export function runItsFile(index: number): string {
  const s = useStore.getState();
  const tower = towerNow();
  const node = tower && findNode(tower, s.selected);
  if (!tower || !node) return 'No node selected';
  const files = filesOf(node);
  if (!files.length) return `${node.label} has no files`;
  if (index >= files.length) return `Only ${files.length} files`;
  s.openFile({ tower: tower.id, files, index });
  return files[index];
}

/**
 * "il prossimo" / "next file" (#130): one step through whatever the user is moving in — the open viewer,
 * the last list shown, or the nodes of the layer in play — in flow (on-screen) order. At either end the
 * caption names where the user stopped, so a spoken "next" past the last one is not silently ignored.
 */
export function runStep(dir: 1 | -1, what: 'auto' | 'file'): string {
  const s = useStore.getState();
  const tower = towerNow();
  const file = s.file;
  // The viewer is the most specific thing on screen: a step switches its tabs.
  if (file && (what === 'file' || file.files.length > 1)) {
    const next = file.index + dir;
    if (next < 0 || next >= file.files.length) return 'No more files';
    s.openFile({ ...file, index: next });
    return file.files[next];
  }
  // A file step past the branch above means no viewer is open (with one open, that branch always runs
  // for `what === 'file'`). Say what close-file says, so the user hears the same cause.
  if (what === 'file') return 'No file open';
  if (tower) {
    // A list the user is walking ("show me the X nodes", then "next"): its order, not the layout's.
    const list = currentList(tower.id);
    if (list?.keys.length) {
      const key = stepList(dir);
      if (!key) return dir > 0 ? 'That was the last one' : 'That was the first one';
      const node = findNode(tower, key);
      if (node) {
        pick(tower, key);
        return node.label;
      }
      // The workspace reloads live: a key the list was built from may name a node the tower on screen no
      // longer has. Drop the list and fall through to the layer, rather than select a key nothing resolves.
      clearList();
    }
    // Otherwise the nodes of the layer in play: the selection's own layer, else the focused one.
    const li = s.selected ? tower.layers.findIndex((l) => l.nodes.some((n) => n.key === s.selected)) : s.focusedLayer;
    if (li !== undefined && li >= 0 && tower.layers[li]) {
      const order = flowOrder(tower.id, tower.layers[li]);
      if (!order.length) return 'Nothing to move through';
      const at = s.selected ? order.findIndex((n) => n.key === s.selected) : -1;
      // Nothing selected: start at the first node, or the last one going back.
      const next = at < 0 ? (dir > 0 ? 0 : order.length - 1) : at + dir;
      if (next < 0 || next >= order.length) return dir > 0 ? 'That was the last one' : 'That was the first one';
      pick(tower, order[next].key);
      return order[next].label;
    }
  }
  return 'Nothing to move through';
}
