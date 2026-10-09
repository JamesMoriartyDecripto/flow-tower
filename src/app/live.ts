import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { splitTarget, type FlowEvent } from '../core/events';
import type { Workspace } from '../core/types';
import { keepAlive } from './scene/frameBudget';

/** Live activity of one node ("tower#layer.node"). Read every frame by the scene, so keep it flat. */
export interface NodeLive {
  /** Open starts (tool/agent) not yet ended. */
  open: number;
  lastTs: number;
  errorTs: number;
  /** Last successful end (tool.end / agent.end ok): drives the green "done" ripple. */
  doneTs: number;
  count: number;
  last?: FlowEvent;
}

export type LiveState = 'run' | 'done' | 'error' | 'flash' | 'idle';

const FEED = 300;
/** An agent that started and never reported back is considered idle after this. */
export const STALE_MS = 90_000;
const FLASH_MS = 1500;
const ERROR_MS = 5000;

interface LiveStore {
  events: FlowEvent[];
  nodes: Map<string, NodeLive>;
  lastId: number;
  feedOpen: boolean;
  /** Dim everything that is not live while the feed is open. */
  spotlight: boolean;
  /** Camera follows the layer of the latest event in the current tower. */
  follow: boolean;
  paused: boolean;
  /** Most recent event, even while the feed is paused (follow mode uses it). */
  lastEvent?: FlowEvent;
  /** Bumped per batch: lets React panels re-render without the scene doing so. */
  version: number;
  apply(events: FlowEvent[]): void;
  toggleFeed(open?: boolean): void;
  setOption(patch: Partial<Pick<LiveStore, 'spotlight' | 'follow' | 'paused'>>): void;
  clear(): void;
}

export const useLive = create<LiveStore>()((set, get) => ({
  events: [],
  nodes: new Map(),
  lastId: 0,
  feedOpen: false,
  spotlight: true,
  follow: false,
  paused: false,
  version: 0,

  apply(batch) {
    // Ids restart from 1 when the server restarts: a batch entirely below lastId means a new server.
    const restarted = batch.length > 0 && batch[batch.length - 1].id < get().lastId;
    const fresh = batch.filter((e) => e.id > (restarted ? 0 : get().lastId));
    if (!fresh.length) return;
    // Let the flash/ripple animations play, but only for events that land somewhere: an agent busy in
    // another project must not keep the tower on screen rendering.
    if (fresh.some((e) => e.targets.length)) keepAlive(1700);
    // Copy-on-write: selectors (useLive(s => s.nodes.get(k)?.last)) must never see a value change
    // without a store update, or useSyncExternalStore tears and re-renders in a loop.
    const nodes = new Map(get().nodes);
    for (const e of fresh) {
      for (const key of e.targets) {
        const n = { ...(nodes.get(key) ?? { open: 0, lastTs: 0, errorTs: 0, doneTs: 0, count: 0 }) };
        if (e.kind === 'tool.start' || e.kind === 'agent.start') n.open++;
        if (e.kind === 'tool.end' || e.kind === 'agent.end' || e.kind === 'session.end') {
          n.open = Math.max(0, n.open - 1);
          if (e.status !== 'error') n.doneTs = e.ts;
        }
        if (e.status === 'error' || e.kind === 'error') n.errorTs = e.ts;
        n.lastTs = Math.max(n.lastTs, e.ts);
        n.count++;
        n.last = e;
        nodes.set(key, n);
      }
    }
    // While paused the scene keeps updating; only the feed list is frozen.
    set({
      nodes,
      events: get().paused ? get().events : [...get().events, ...fresh].slice(-FEED),
      lastId: fresh[fresh.length - 1].id,
      lastEvent: fresh[fresh.length - 1],
      version: get().version + 1,
    });
  },
  toggleFeed: (open) => set({ feedOpen: open ?? !get().feedOpen }),
  setOption: (patch) => set(patch),
  clear: () => set({ events: [], nodes: new Map(), version: get().version + 1 }),
}));

/** Current state of a node and an intensity 0..1 for animations. */
export function liveState(n: NodeLive | undefined, now: number): { state: LiveState; level: number } {
  if (!n) return { state: 'idle', level: 0 };
  if (now - n.errorTs < ERROR_MS) return { state: 'error', level: 1 - (now - n.errorTs) / ERROR_MS * 0.5 };
  if (n.open > 0 && now - n.lastTs < STALE_MS) return { state: 'run', level: 1 };
  if (now - n.doneTs < FLASH_MS) return { state: 'done', level: 1 - (now - n.doneTs) / FLASH_MS };
  if (now - n.lastTs < FLASH_MS) return { state: 'flash', level: 1 - (now - n.lastTs) / FLASH_MS };
  return { state: 'idle', level: 0 };
}

/** The strongest state among several nodes: error > run > done > flash > idle. */
export function strongest(states: { state: LiveState; level: number }[]) {
  const rank: Record<LiveState, number> = { error: 4, run: 3, done: 2, flash: 1, idle: 0 };
  return states.reduce((a, b) => (rank[b.state] > rank[a.state] || (b.state === a.state && b.level > a.level) ? b : a), { state: 'idle' as LiveState, level: 0 });
}

/** Tower id → every tower nested below it (any depth), for propagating activity upwards. */
export function descendants(ws: Workspace): Map<string, Set<string>> {
  const children = new Map<string, Set<string>>();
  for (const t of Object.values(ws.towers)) {
    for (const l of t.layers) for (const n of l.nodes) if (n.tower && n.tower !== t.id) {
      children.set(t.id, (children.get(t.id) ?? new Set()).add(n.tower));
    }
  }
  const out = new Map<string, Set<string>>();
  const walk = (id: string, seen: Set<string>) => {
    for (const c of children.get(id) ?? []) if (!seen.has(c)) { seen.add(c); walk(c, seen); }
    return seen;
  };
  for (const id of Object.keys(ws.towers)) out.set(id, walk(id, new Set()));
  return out;
}

/** Aggregated live state of a whole tower subtree (the tower itself + its nested towers). */
export function subtreeState(towers: Set<string>, nodes: Map<string, NodeLive>, now: number) {
  const states = [];
  for (const [key, n] of nodes) if (towers.has(splitTarget(key)[0])) states.push(liveState(n, now));
  return strongest(states);
}

/** Live state of every non-idle node of one tower ("layer.node" → state), incl. sub-tower activity. */
export function computeStates(towerId: string, nested: Map<string, string>, desc: Map<string, Set<string>>, nodes: Map<string, NodeLive>, now: number) {
  const states = new Map<string, LiveState>();
  const prefix = `${towerId}#`;
  for (const [key, n] of nodes) {
    if (!key.startsWith(prefix)) continue;
    const s = liveState(n, now).state;
    if (s !== 'idle') states.set(key.slice(prefix.length), s);
  }
  for (const [nodeKey, sub] of nested) {
    const s = subtreeState(new Set([sub, ...(desc.get(sub) ?? [])]), nodes, now).state;
    if (s !== 'idle') states.set(nodeKey, strongest([{ state: s, level: 1 }, { state: states.get(nodeKey) ?? 'idle', level: 1 }]).state);
  }
  return states;
}

/**
 * Polls the live store 4×/s and maps the states through `reduce`; re-renders only when the
 * reduced value's signature changes. Keep `reduce` small: callers decide how much they listen to.
 */
export function useLivePoll<T>(
  towerId: string | undefined, nested: Map<string, string>, desc: Map<string, Set<string>>,
  reduce: (states: Map<string, LiveState>) => T, sig: (value: T) => string, initial: T,
): T {
  const [snapshot, setSnapshot] = useState<{ sig: string; value: T }>({ sig: '', value: initial });
  useEffect(() => {
    if (!towerId) return;
    let t: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const states = computeStates(towerId, nested, desc, useLive.getState().nodes, Date.now());
      const value = reduce(states);
      const next = sig(value);
      setSnapshot((prev) => (prev.sig === next ? prev : { sig: next, value }));
      // Everything idle: stop waking up 4 times a second until the next event arrives.
      if (!states.size && t) { clearInterval(t); t = undefined; }
    };
    const start = () => { t ??= setInterval(tick, 250); tick(); };
    start();
    const unsubscribe = useLive.subscribe((s, prev) => { if (s.nodes !== prev.nodes) start(); });
    return () => { clearInterval(t); unsubscribe(); };
  }, [towerId, nested, desc]); // eslint-disable-line react-hooks/exhaustive-deps
  return snapshot.value;
}

const statesSig = (m: Map<string, LiveState>) => [...m].map(([k, s]) => `${k}:${s}`).sort().join('|');
const EMPTY_STATES = new Map<string, LiveState>();

/** Live node states of one tower (4 Hz, deduplicated). */
export function useTowerLive(towerId: string | undefined, nested: Map<string, string>, desc: Map<string, Set<string>>) {
  return useLivePoll(towerId, nested, desc, (m) => m, statesSig, EMPTY_STATES);
}

/** Loads recent events, then follows the server push channel. */
export function useLiveSync() {
  useEffect(() => {
    fetch('/api/events')
      .then((r) => (r.ok ? r.json() : []))
      .then((events: FlowEvent[]) => useLive.getState().apply(events))
      .catch(() => {});
    const onEvents = (events: FlowEvent[]) => useLive.getState().apply(events);
    import.meta.hot?.on('flow-tower:events', onEvents);
    return () => import.meta.hot?.off('flow-tower:events', onEvents);
  }, []);
}
