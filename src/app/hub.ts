/**
 * The page-side model of the Hub panel (#92): the Now rows, the top-bar pill and the Machines dots.
 * Pure (no React, no fetch, no DOM) like src/app/sharing.ts, so every rule can be unit-tested without a
 * browser. Metadata only: a row is built from allow-listed identity fields, so a `message`, `data`, a
 * tool argument or prompt text can never end up in it.
 */
import type { FlowEvent } from '../core/events';

/** A row is live within two minutes: the run is lit, a longer gap means it probably just started or ended. */
export const RUN_MS = 120_000;
/** Idle up to fifteen minutes: past that the row is silent (the machine spoke, but long ago). */
export const IDLE_MS = 900_000;

export type NowState = 'run' | 'idle' | 'silent';

/** One line of the Now tab: who runs what, where, and how recently. */
export interface NowRow {
  machine: string;
  runtime: string;
  project: string;
  /** A person, or 'AUTO' when the event carries no user or looks like a scheduled/CI run. */
  startedBy: string;
  /** Latest ts of the group, so the UI can sort and the state can be derived. */
  last: number;
  state: NowState;
  count: number;
}

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

/** A group is state, then recency: run first, and the more recent first within a state. */
const stateOf = (last: number, now: number): NowState =>
  now - last < RUN_MS ? 'run' : now - last < IDLE_MS ? 'idle' : 'silent';

const RANK: Record<NowState, number> = { run: 0, idle: 1, silent: 2 };

/**
 * One row per (machine, runtime, project, startedBy) seen among the live events: a group is a "who is
 * doing what", so several events from the same runner collapse onto one line with a count. `now` is a
 * parameter so the state thresholds can be tested with a fake clock.
 */
export function nowRows(events: FlowEvent[], now: number): NowRow[] {
  const groups = new Map<string, NowRow>();
  for (const e of events) {
    const machine = machineOf(e);
    const runtime = runtimeOf(e);
    const project = projectOf(e);
    const startedBy = startedByOf(e);
    // JSON of the four fields: a separator character could collide inside a project or user name.
    const key = JSON.stringify([machine, runtime, project, startedBy]);
    const row = groups.get(key);
    if (row) {
      row.count += 1;
      row.last = Math.max(row.last, e.ts);
    } else {
      groups.set(key, { machine, runtime, project, startedBy, last: e.ts, state: 'silent', count: 1 });
    }
  }
  const rows = [...groups.values()];
  for (const row of rows) row.state = stateOf(row.last, now);
  // Run, idle, silent; newest first inside each; the key breaks a tie so the order never depends on input.
  return rows.sort((a, b) =>
    RANK[a.state] - RANK[b.state] ||
    b.last - a.last ||
    a.machine.localeCompare(b.machine) ||
    a.runtime.localeCompare(b.runtime) ||
    a.project.localeCompare(b.project) ||
    a.startedBy.localeCompare(b.startedBy));
}

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
