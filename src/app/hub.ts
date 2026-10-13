/**
 * The page-side model of the Hub panel (#92): the Now rows, the top-bar pill and the Machines dots.
 * Pure (no React, no fetch, no DOM) like src/app/sharing.ts, so every rule can be unit-tested without a
 * browser. Metadata only: a row is built from allow-listed identity fields, so a `message`, `data`, a
 * tool argument or prompt text can never end up in it.
 */
import { splitTarget, type FlowEvent } from '../core/events';

/** A row is live within two minutes: the run is lit, a longer gap means it probably just started or ended. */
export const RUN_MS = 120_000;
/** Idle up to fifteen minutes: past that the row is silent (the machine spoke, but long ago). */
export const IDLE_MS = 900_000;

export type NowState = 'run' | 'idle' | 'silent';

/**
 * The last error of a group: when it happened, the node label it landed on and the tool it ran. Never the
 * message: an error text is free text from the event, so the Now tab only names it and points at the Live feed.
 */
export interface NowError {
  ts: number;
  node?: string;
  tool?: string;
}

/** One line of the Now tab: who runs what, where, and how recently. */
export interface NowRow {
  /** Stable React key: the group key the row was built from. */
  key: string;
  machine: string;
  runtime: string;
  project: string;
  /** A person, or 'AUTO' when the event carries no user or looks like a scheduled/CI run. */
  startedBy: string;
  /** Tower name of the latest event that had a target; else the project; else '–'. */
  tower: string;
  /** Label of the node the latest targeted event landed on. */
  node?: string;
  /** "towerId#node" of that latest target, so the UI can jump there. */
  target?: string;
  lastError?: NowError;
  /** Latest ts of the group, so the UI can sort and the state can be derived. */
  last: number;
  state: NowState;
  count: number;
}

/** What a "towerId#node" target shows as: the tower name and the node label, both from the library. */
export interface TargetLabel {
  tower: string;
  node?: string;
}
/** Maps a target to its labels. Without a workspace the ids themselves are the labels. */
export type ResolveTarget = (target: string) => TargetLabel;

/** An error for the Now tab: the status the source set, or the error kind (the same rule the Live feed uses). */
const isError = (e: FlowEvent) => e.status === 'error' || e.kind === 'error';

const idLabels: ResolveTarget = (target) => {
  const [tower, node] = splitTarget(target);
  return { tower, node };
};

/**
 * Runtimes that act on their own: a scheduled job or CI runner has no human behind it, so naming it AUTO
 * keeps a cron pile-up from looking like a busy teammate.
 */
const AUTO_RE = /cron|schedul|\bci\b|github-actions|lambda|serverless/i;

/** The identity fields a row keeps, taken one by one and never spread from the event. */
const machineOf = (e: FlowEvent) => e.host ?? e.sender ?? 'local';
const runtimeOf = (e: FlowEvent) => e.runtime ?? e.source;
const projectOf = (e: FlowEvent) => e.project ?? '–';
const startedByOf = (e: FlowEvent) =>
  !e.user || AUTO_RE.test(e.runtime ?? '') || AUTO_RE.test(e.source ?? '') ? 'AUTO' : e.user;

/** A short, stable hash of a group key (FNV-1a): unique enough per render, and it hides the text it came from. */
const hashKey = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

/** A group is state, then recency: run first, and the more recent first within a state. */
const stateOf = (last: number, now: number): NowState =>
  now - last < RUN_MS ? 'run' : now - last < IDLE_MS ? 'idle' : 'silent';

const RANK: Record<NowState, number> = { run: 0, idle: 1, silent: 2 };

/**
 * One row per (machine, session) seen among the live events; events with no session fall back to the old
 * (machine, runtime, project, startedBy) key, since a session-less event cannot be told apart otherwise.
 * A group is a "who is doing what", so its events collapse onto one line with a count. The identity
 * fields, tower and node come from the group's latest event (the one that says where it is now), and the
 * last error is the latest one with an error status. `now` is a parameter so the state thresholds can be
 * tested with a fake clock; `resolve` turns a target into labels (the library names when a workspace is
 * loaded, the raw ids otherwise).
 */
export function nowRows(events: FlowEvent[], now: number, resolve: ResolveTarget = idLabels): NowRow[] {
  const groups = new Map<string, FlowEvent[]>();
  for (const e of events) {
    const machine = machineOf(e);
    // JSON of the parts: a separator character could collide inside a session, project or user name.
    const key = e.session !== undefined
      ? JSON.stringify([machine, 'session', e.session])
      : JSON.stringify([machine, runtimeOf(e), projectOf(e), startedByOf(e)]);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const rows: NowRow[] = [];
  for (const [group, list] of groups) {
    // The group key holds the session text, so the row gets a hash of it instead: a stable React key with no free text.
    const key = hashKey(group);
    // Latest first, ties keep the input order: the first event of the newest timestamp wins.
    let latest = list[0];
    let latestTarget: FlowEvent | undefined;
    let error: FlowEvent | undefined;
    let last = list[0].ts;
    for (const e of list) {
      if (e.ts > latest.ts) latest = e;
      last = Math.max(last, e.ts);
      if (e.targets.length && (!latestTarget || e.ts > latestTarget.ts)) latestTarget = e;
      if (isError(e) && (!error || e.ts > error.ts)) error = e;
    }
    const target = latestTarget?.targets[0];
    const labels = target !== undefined ? resolve(target) : undefined;
    const row: NowRow = {
      key,
      machine: machineOf(latest),
      runtime: runtimeOf(latest),
      project: projectOf(latest),
      startedBy: startedByOf(latest),
      tower: labels?.tower || projectOf(latest) || '–',
      node: labels?.node,
      target,
      last,
      state: stateOf(last, now),
      count: list.length,
    };
    if (error) {
      const errTarget = error.targets[0];
      // Only resolved names and the tool: the event's message stays out of the row.
      row.lastError = {
        ts: error.ts,
        node: errTarget !== undefined ? resolve(errTarget).node : undefined,
        tool: error.tool,
      };
    }
    rows.push(row);
  }
  // Run, idle, silent; newest first inside each; the key breaks a tie so the order never depends on input.
  return rows.sort((a, b) =>
    RANK[a.state] - RANK[b.state] ||
    b.last - a.last ||
    a.machine.localeCompare(b.machine) ||
    a.runtime.localeCompare(b.runtime) ||
    a.project.localeCompare(b.project) ||
    a.startedBy.localeCompare(b.startedBy) ||
    a.key.localeCompare(b.key));
}

/** How many Now rows are live right now: the library header chip counts these ("● 2 working"). */
export const workingCount = (rows: NowRow[]): number => rows.filter((r) => r.state === 'run').length;

/** A coarse age, floored and unit-suffixed: "12 s", "4 m", "3 h", "41 d". A future/negative age reads "0 s". */
export function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** The top-bar pill: online machines over issued tokens, only on a hub. */
export function hubPill(me?: { hub: boolean; online: number; tokens: number }): string | undefined {
  if (!me?.hub) return undefined;
  return `HUB ${me.online}/${me.tokens}`;
}

/**
 * One alert as GET /api/hub/alerts shapes it (src/server/alerts.ts). Metadata only: the rule id, the
 * subject's name and the one-line message the rule wrote, never prompt text.
 */
export interface HubAlert {
  id: string;
  rule: string;
  level: 'warning' | 'critical';
  subject: { kind: string; name: string };
  message: string;
  acked?: boolean;
}

/** The whole /api/hub/alerts answer: the firing alerts and every rule with whether it is enabled. */
export interface AlertsView {
  alerts: HubAlert[];
  rules: { id: string; title: string; enabled: boolean }[];
}

/**
 * The alert pill: unacked alerts only (an acked one has been seen, so it no longer asks for attention),
 * and its colour follows the worst of them. Undefined means hidden, which is the zero case.
 */
export function alertsPill(view?: AlertsView): { count: number; level: 'warning' | 'critical' } | undefined {
  const open = view?.alerts.filter((a) => !a.acked) ?? [];
  if (!open.length) return undefined;
  return { count: open.length, level: open.some((a) => a.level === 'critical') ? 'critical' : 'warning' };
}

/** How many rules are switched on: the Alerts tab says so when nothing fires, so the quiet state still reads as checked. */
export const activeRules = (view?: AlertsView): number => view?.rules.filter((r) => r.enabled).length ?? 0;

export type MachineDot = '●' | '◐' | '○' | '✕';

/**
 * The dot and word for one Machines row. A revoked or paused token is a hard "off" whatever the clock
 * says; an online row is active. Offline we go by `lastSeen`: a row with one has been heard from before,
 * so it reads silent however long ago that was; only a row we have never actually found reads "never".
 * Note that `lastSeen` alone cannot say how stale the row is, only online can (see machines.ts).
 */
export function machineState(row: { state: string; online: boolean; lastSeen?: number }): { dot: MachineDot; label: string } {
  if (row.state === 'revoked' || row.state === 'paused') return { dot: '✕', label: row.state };
  if (row.online) return { dot: '●', label: 'active' };
  return row.lastSeen !== undefined ? { dot: '○', label: 'silent' } : { dot: '○', label: 'never' };
}
