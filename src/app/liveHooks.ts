import { useEffect, useMemo, useRef } from 'react';
import { splitTarget } from '../core/events';
import { descendants, useLive, useLivePoll, useTowerLive, type LiveState } from './live';
import { useStore, useTower } from './store';

/** Tower id → nested tower ids for the current workspace (memoized per workspace load). */
export function useDescendants() {
  const ws = useStore((s) => s.workspace);
  return useMemo(() => (ws ? descendants(ws) : new Map<string, Set<string>>()), [ws]);
}

/** Live states of the tower on screen, plus helpers to map sub-tower activity onto its parent nodes. */
export function useCurrentTowerLive() {
  const tower = useTower();
  const desc = useDescendants();
  const nested = useMemo(() => new Map(
    (tower?.layers ?? []).flatMap((l) => l.nodes.filter((n) => n.tower).map((n) => [n.key, n.tower!] as const)),
  ), [tower]);
  const subtrees = useMemo(() => new Map(
    [...nested].map(([key, sub]) => [key, new Set([sub, ...(desc.get(sub) ?? [])])] as const),
  ), [nested, desc]);
  const states = useTowerLive(tower?.id, nested, desc);
  return { tower, states, subtrees };
}

export type LayerTint = 'run' | 'error' | undefined;
const NO_TINTS: Record<string, LayerTint> = {};
const tintSig = (t: Record<string, LayerTint>) => Object.entries(t).map(([k, v]) => `${k}:${v}`).sort().join('|');

/**
 * Only what the 3D scene needs from live data: the strongest state per layer, plus the sub-tower map
 * for the overlay. The scene root re-renders only when a layer's tint changes, never per event.
 */
export function useSceneLive() {
  const tower = useTower();
  const desc = useDescendants();
  const nested = useMemo(() => new Map(
    (tower?.layers ?? []).flatMap((l) => l.nodes.filter((n) => n.tower).map((n) => [n.key, n.tower!] as const)),
  ), [tower]);
  const subtrees = useMemo(() => new Map(
    [...nested].map(([key, sub]) => [key, new Set([sub, ...(desc.get(sub) ?? [])])] as const),
  ), [nested, desc]);
  const tints = useLivePoll(tower?.id, nested, desc, (states: Map<string, LiveState>) => {
    const out: Record<string, LayerTint> = {};
    for (const [key, st] of states) {
      const layer = key.slice(0, key.indexOf('.'));
      if (st === 'error') out[layer] = 'error';
      else if (st === 'run' && out[layer] !== 'error') out[layer] = 'run';
    }
    return out;
  }, tintSig, NO_TINTS);
  return { tints, subtrees };
}

const FOLLOW_EVERY_MS = 2500;

/** Follow mode: focus the layer of the latest event that lands in the current tower (throttled). */
export function useFollow() {
  const tower = useTower();
  const lastMove = useRef(0);
  useEffect(() => useLive.subscribe((s, prev) => {
    if (!s.follow || !tower || s.lastEvent === prev.lastEvent || !s.lastEvent) return;
    const target = s.lastEvent.targets.find((t) => t.startsWith(`${tower.id}#`));
    if (!target || Date.now() - lastMove.current < FOLLOW_EVERY_MS) return;
    const layerId = splitTarget(target)[1].split('.')[0];
    const index = tower.layers.findIndex((l) => l.id === layerId);
    const ui = useStore.getState();
    if (index < 0 || ui.focusedLayer === index || ui.selected) return;
    lastMove.current = Date.now();
    ui.focusLayer(index);
  }), [tower]);
}
