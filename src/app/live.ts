import { useEffect } from 'react';
import { create } from 'zustand';
import type { FlowEvent } from '../core/events';

/** Live activity of one node ("tower#layer.node"). Read every frame by the scene, so keep it flat. */
export interface NodeLive {
  /** Open starts (tool/agent) not yet ended. */
  open: number;
  lastTs: number;
  errorTs: number;
  count: number;
  last?: FlowEvent;
}

const FEED = 300;
/** An agent that started and never reported back is considered idle after this. */
export const STALE_MS = 90_000;

interface LiveState {
  events: FlowEvent[];
  nodes: Map<string, NodeLive>;
  lastId: number;
  feedOpen: boolean;
  /** Bumped per batch: lets React panels re-render without the scene doing so. */
  version: number;
  apply(events: FlowEvent[]): void;
  toggleFeed(open?: boolean): void;
  clear(): void;
}

export const useLive = create<LiveState>()((set, get) => ({
  events: [],
  nodes: new Map(),
  lastId: 0,
  feedOpen: false,
  version: 0,

  apply(batch) {
    // Ids restart from 1 when the server restarts: a batch entirely below lastId means a new server.
    const restarted = batch.length > 0 && batch[batch.length - 1].id < get().lastId;
    const fresh = batch.filter((e) => e.id > (restarted ? 0 : get().lastId));
    if (!fresh.length) return;
    const nodes = get().nodes;
    for (const e of fresh) {
      for (const key of e.targets) {
        const n = nodes.get(key) ?? { open: 0, lastTs: 0, errorTs: 0, count: 0 };
        if (e.kind === 'tool.start' || e.kind === 'agent.start') n.open++;
        if (e.kind === 'tool.end' || e.kind === 'agent.end' || e.kind === 'session.end') n.open = Math.max(0, n.open - 1);
        if (e.status === 'error' || e.kind === 'error') n.errorTs = e.ts;
        n.lastTs = Math.max(n.lastTs, e.ts);
        n.count++;
        n.last = e;
        nodes.set(key, n);
      }
    }
    set({
      events: [...get().events, ...fresh].slice(-FEED),
      lastId: fresh[fresh.length - 1].id,
      version: get().version + 1,
    });
  },
  toggleFeed: (open) => set({ feedOpen: open ?? !get().feedOpen }),
  clear: () => set({ events: [], nodes: new Map(), version: get().version + 1 }),
}));

/** Activity level 0..1 and error flag for a node right now (used by the 3D overlay). */
export function activity(n: NodeLive | undefined, now: number): { level: number; active: boolean; error: boolean } {
  if (!n) return { level: 0, active: false, error: false };
  const age = now - n.lastTs;
  const active = n.open > 0 && age < STALE_MS;
  const flash = Math.max(0, 1 - age / 1500);
  return { level: Math.max(flash, active ? 0.55 : 0), active, error: now - n.errorTs < 4000 };
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
