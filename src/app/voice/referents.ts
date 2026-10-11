/**
 * The list the user was last shown, so a follow-up like "il prossimo" / "the next one" knows what
 * "next" refers to. The voice agent writes a list when it shows one (a search result, a layer's
 * nodes) and steps through it on the next turn.
 *
 * The state is one module variable, replaced on every change and never mutated in place: a step can
 * never leave a reader looking at a half-updated list.
 */

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

export function clearList() {
  list = undefined;
}

/**
 * The list on screen, or nothing. A list kept for another tower is stale (the caller passes the tower
 * id now on screen), so it is dropped rather than handed to the agent as if it were still visible.
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
