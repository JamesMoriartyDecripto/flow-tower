// Live store for events arriving over SSE. Components read it with useSyncExternalStore through zustand.
import { create } from 'zustand';

export interface LiveEvent { node: string; kind: 'start' | 'end' | 'log'; text: string; at: number }

interface LiveState {
  events: LiveEvent[];
  active: Record<string, number>;
  push: (e: LiveEvent) => void;
  clear: () => void;
}

const MAX_EVENTS = 500;

export const useLive = create<LiveState>((set) => ({
  events: [],
  active: {},
  push: (e) =>
    set((s) => {
      s.events.push(e);
      if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
      if (e.kind === 'start') s.active[e.node] = (s.active[e.node] ?? 0) + 1;
      if (e.kind === 'end') s.active[e.node] = Math.max(0, (s.active[e.node] ?? 1) - 1);
      return s;
    }),
  clear: () => set({ events: [], active: {} }),
}));
