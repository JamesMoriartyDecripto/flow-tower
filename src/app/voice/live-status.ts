/**
 * The answer to "Cosa sta succedendo?" (#160): a pure summary of the live activity the page already has.
 * No store, no React, no DOM, so every rule is unit-tested with a fake clock (like src/app/hub.ts).
 *
 * Privacy: the result goes to the voice LLM as a tool result, so it is metadata only. Every field is copied
 * one by one from an allow-listed source; an event is never spread, so its message, data, arguments and
 * any other free text can never reach the summary.
 */
import { splitTarget, type FlowEvent } from '../../core/events';
import type { ResolvedNode, ResolvedTower, Workspace } from '../../core/types';
import { ago, nowRows } from '../hub';
import { STALE_MS, type NodeLive } from '../live';
import { findNode } from '../store';

/** How far back "recent" reaches: ten minutes of live activity. */
export const WINDOW_MS = 600_000;
const MAX_ERRORS = 5;
const MAX_RUNNING = 5;
const MAX_BUSIEST = 3;

export interface ErrorEntry {
  key: string;
  node: string;
  layer: string;
  tower: string;
  on_screen: boolean;
  ago: string;
  kind?: FlowEvent['kind'];
  tool?: string;
}

export interface RunningEntry {
  key: string;
  node: string;
  layer: string;
  tower: string;
  on_screen: boolean;
  since: string;
}

export interface BusyEntry {
  node: string;
  tower: string;
  events: number;
}

export interface LiveStatus {
  quiet: boolean;
  events: number;
  errors: ErrorEntry[];
  running: RunningEntry[];
  busiest: BusyEntry[];
  newest_error?: ErrorEntry;
  /** Only on a hub: which machines run now, and which were heard from long ago. */
  hub?: { running: string[]; silent: string[] };
}

export interface LiveStatusInput {
  events: FlowEvent[];
  nodes: Map<string, NodeLive>;
  ws: Workspace;
  towerId?: string;
  hub: boolean;
  now: number;
}

/** A target resolved against the workspace; undefined when its tower or node is not there. */
interface Located {
  key: string;
  node: ResolvedNode;
  layer: string;
  tower: ResolvedTower;
  towerId: string;
}

function locate(ws: Workspace, target: string): Located | undefined {
  const [towerId, key] = splitTarget(target);
  // Own-key check, not a lookup: a target like "constructor#x" must not resolve through the prototype.
  const tower = Object.hasOwn(ws.towers, towerId) ? ws.towers[towerId] : undefined;
  const node = findNode(tower, key);
  if (!tower || !node) return undefined;
  const layer = tower.layers.find((l) => l.nodes.some((n) => n.key === key))?.title ?? node.layer;
  return { key, node, layer, tower, towerId };
}

export function liveStatus(input: LiveStatusInput): LiveStatus {
  const { events, nodes, ws, towerId, hub, now } = input;
  const since = now - WINDOW_MS;
  const recent = events.filter((e) => e.ts >= since);

  // Errors: one per node, newest first. Sorted before the cut so a stale error never takes a slot.
  const errorRows: { ts: number; entry: ErrorEntry }[] = [];
  for (const [target, n] of nodes) {
    if (n.errorTs < since) continue;
    const loc = locate(ws, target);
    if (!loc) continue;
    errorRows.push({
      ts: n.errorTs,
      entry: {
        key: loc.key,
        node: loc.node.label,
        layer: loc.layer,
        tower: loc.tower.name,
        on_screen: loc.towerId === towerId,
        ago: ago(now - n.errorTs),
        kind: n.last?.kind,
        tool: n.last?.tool,
      },
    });
  }
  errorRows.sort((a, b) => b.ts - a.ts);
  const errors = errorRows.slice(0, MAX_ERRORS).map((r) => r.entry);

  // Running: a node with an open start that has been heard from recently. A longer silence is a stuck
  // or abandoned start, and reporting it as running would be a lie.
  const runningRows: { ts: number; entry: RunningEntry }[] = [];
  for (const [target, n] of nodes) {
    if (!(n.open > 0 && now - n.lastTs < STALE_MS)) continue;
    const loc = locate(ws, target);
    if (!loc) continue;
    runningRows.push({
      ts: n.lastTs,
      entry: {
        key: loc.key,
        node: loc.node.label,
        layer: loc.layer,
        tower: loc.tower.name,
        on_screen: loc.towerId === towerId,
        since: ago(now - n.lastTs),
      },
    });
  }
  runningRows.sort((a, b) => b.ts - a.ts);
  const running = runningRows.slice(0, MAX_RUNNING).map((r) => r.entry);

  // Busiest: the window's events counted per target, so "where is the work" is answered by volume.
  const counts = new Map<string, number>();
  for (const e of recent) for (const t of e.targets) counts.set(t, (counts.get(t) ?? 0) + 1);
  const busy: { node: string; tower: string; events: number }[] = [];
  for (const [target, count] of counts) {
    const loc = locate(ws, target);
    if (loc) busy.push({ node: loc.node.label, tower: loc.tower.name, events: count });
  }
  // Ties by label, then tower, so the order never depends on map insertion.
  busy.sort((a, b) => b.events - a.events || a.node.localeCompare(b.node) || a.tower.localeCompare(b.tower));

  const status: LiveStatus = {
    quiet: recent.length === 0,
    events: recent.length,
    errors,
    running,
    busiest: busy.slice(0, MAX_BUSIEST),
    newest_error: errors[0],
  };

  if (hub) {
    // All events, not the window: "silent" means heard from long ago, which the window cannot say.
    const rows = nowRows(events, now);
    const runningMachines = [...new Set(rows.filter((r) => r.state === 'run').map((r) => r.machine))];
    const silentMachines = [...new Set(rows.filter((r) => r.state === 'silent').map((r) => r.machine))]
      .filter((m) => !runningMachines.includes(m));
    status.hub = { running: runningMachines, silent: silentMachines };
  }
  return status;
}
