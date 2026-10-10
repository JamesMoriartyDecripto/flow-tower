import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { splitTarget, type FlowEvent } from '../core/events';
import type { ResolvedRuntime, ResolvedTower, Workspace } from '../core/types';
import { keepAlive } from './scene/frameBudget';
import { STATIC } from './staticData';

/** Who/where a node last ran: copied from the last event that carried any of these. */
export interface LiveWhere {
  host?: string;
  runtime?: string;
  runtimeRef?: string;
  user?: string;
  /** Timestamp of the event that set this, so the UI can tell how fresh it is. */
  ts: number;
}

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
  /** Summed from `usage` events (OTLP telemetry, Pi, Codex exec...). */
  usage?: Usage;
  /** True when the usage above was estimated, not reported by the runtime: shown as "≈". */
  estimated?: boolean;
  /** Who/where the node last ran, from the last event that named a user, host or runtime. */
  where?: LiveWhere;
}

export interface Usage { tokens: number; cost: number; calls: number }

const addUsage = (u: Usage | undefined, e: FlowEvent): Usage => ({
  tokens: (u?.tokens ?? 0) + (e.tokens ?? 0),
  cost: (u?.cost ?? 0) + (e.cost_usd ?? 0),
  calls: (u?.calls ?? 0) + 1,
});

export type LiveState = 'run' | 'done' | 'error' | 'flash' | 'idle';

/**
 * The runtime a `runtimeRef` points at, but only when the tower declares that exact id as an own key (#82):
 * a ref like "constructor" or "__proto__" comes from an event, and must not resolve through the prototype.
 */
export function declaredRuntime(tower: ResolvedTower | undefined, ref: string | undefined): ResolvedRuntime | undefined {
  if (!ref || !tower || !Object.hasOwn(tower.runtimes, ref)) return undefined;
  return tower.runtimes[ref];
}

const FEED = 300;
/** An agent that started and never reported back is considered idle after this. */
export const STALE_MS = 90_000;
const FLASH_MS = 1500;
const ERROR_MS = 5000;

interface LiveStore {
  events: FlowEvent[];
  nodes: Map<string, NodeLive>;
  /**
   * Usage per group of towers an event landed in (key: sorted tower ids joined by newlines). A tower or a
   * project total sums the groups it intersects, so an agent present in a tower and in its sub-tower
   * is counted once per project, not twice.
   */
  usage: Map<string, Usage>;
  lastId: number;
  /** Smallest event id applied: applied ids always form the range firstId..lastId (pushes are sequential). */
  firstId: number;
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
  /** `initial`: the GET of recent events at page load, which can resolve after newer pushed events. */
  apply(events: FlowEvent[], initial?: boolean): void;
  toggleFeed(open?: boolean): void;
  setOption(patch: Partial<Pick<LiveStore, 'spotlight' | 'follow' | 'paused'>>): void;
  clear(): void;
}

export const useLive = create<LiveStore>()((set, get) => ({
  events: [],
  nodes: new Map(),
  usage: new Map(),
  lastId: 0,
  firstId: Infinity,
  feedOpen: false,
  spotlight: true,
  follow: false,
  paused: false,
  version: 0,

  apply(batch, initial = false) {
    // Ids restart from 1 when the server restarts: a pushed batch entirely below lastId means a new server.
    // The initial fetch is never that signal: it may simply arrive after newer pushed events, so it only
    // adds the events not seen yet.
    // The feed keeps only the last events, so "already applied" is the id range, not the feed contents.
    const { firstId, lastId } = get();
    const restarted = !initial && batch.length > 0 && batch[batch.length - 1].id < lastId;
    const fresh = initial
      ? batch.filter((e) => e.id < firstId || e.id > lastId)
      : batch.filter((e) => e.id > (restarted ? 0 : lastId));
    if (!fresh.length) return;
    // Let the flash/ripple animations play, but only for events that land somewhere: an agent busy in
    // another project must not keep the tower on screen rendering.
    if (fresh.some((e) => e.targets.length)) keepAlive(1700);
    // Copy-on-write: selectors (useLive(s => s.nodes.get(k)?.last)) must never see a value change
    // without a store update, or useSyncExternalStore tears and re-renders in a loop.
    const nodes = new Map(get().nodes);
    let usage = get().usage;
    for (const e of fresh) {
      if (e.kind === 'usage' && e.targets.length) {
        if (usage === get().usage) usage = new Map(usage);
        const group = [...new Set(e.targets.map((t) => splitTarget(t)[0]))].sort().join('\n');
        usage.set(group, addUsage(usage.get(group), e));
      }
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
        // Merge into a fresh object (copy-on-write): an event that only names the host must not wipe
        // the runtime or user seen just before, and it is unknown fields, not a run end, that clears them.
        if (e.host || e.runtime || e.runtimeRef || e.user) {
          n.where = { host: e.host ?? n.where?.host, runtime: e.runtime ?? n.where?.runtime, runtimeRef: e.runtimeRef ?? n.where?.runtimeRef, user: e.user ?? n.where?.user, ts: e.ts };
        }
        if (e.kind === 'usage') {
          n.usage = addUsage(n.usage, e);
          // From the latest usage event only: an exact report replaces an estimated one.
          n.estimated = e.estimated ?? false;
        }
        nodes.set(key, n);
      }
    }
    // While paused the scene keeps updating; only the feed list is frozen.
    set({
      nodes,
      usage,
      events: get().paused ? get().events : (initial ? [...get().events, ...fresh].sort((a, b) => a.id - b.id) : [...get().events, ...fresh]).slice(-FEED),
      lastId: Math.max(initial ? lastId : 0, fresh[fresh.length - 1].id),
      firstId: Math.min(restarted ? Infinity : firstId, ...fresh.map((e) => e.id)),
      lastEvent: fresh[fresh.length - 1],
      version: get().version + 1,
    });
  },
  toggleFeed: (open) => set({ feedOpen: open ?? !get().feedOpen }),
  setOption: (patch) => set(patch),
  clear: () => set({ events: [], nodes: new Map(), usage: new Map(), version: get().version + 1 }),
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

/** Usage summed over every tower group that touches one of `towers` (a tower, or a project and its sub-towers). */
export function usageOf(usage: Map<string, Usage>, towers: Set<string>): Usage | undefined {
  let total: Usage | undefined;
  for (const [group, u] of usage) {
    if (!group.split('\n').some((t) => towers.has(t))) continue;
    total = { tokens: (total?.tokens ?? 0) + u.tokens, cost: (total?.cost ?? 0) + u.cost, calls: (total?.calls ?? 0) + u.calls };
  }
  return total;
}

/** "12.3k tokens · $0.42" */
export function formatUsage(u: Usage): string {
  const tokens = u.tokens >= 1e6 ? `${(u.tokens / 1e6).toFixed(1)}M` : u.tokens >= 1e3 ? `${(u.tokens / 1e3).toFixed(1)}k` : String(u.tokens);
  const cost = u.cost > 0 ? ` · $${u.cost < 0.01 ? u.cost.toFixed(4) : u.cost.toFixed(2)}` : '';
  return `${tokens} tokens${cost}`;
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
    if (STATIC) return; // the demo has no server: see demo.ts
    fetch('/api/events')
      .then((r) => (r.ok ? r.json() : []))
      .then((events: FlowEvent[]) => useLive.getState().apply(events, true))
      .catch(() => {});
    const onEvents = (events: FlowEvent[]) => useLive.getState().apply(events);
    import.meta.hot?.on('flow-tower:events', onEvents);
    return () => import.meta.hot?.off('flow-tower:events', onEvents);
  }, []);
}
