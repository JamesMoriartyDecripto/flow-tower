/**
 * Builds the AlertInput of one evaluation (#94) from what the hub already holds: the machine rows, the config
 * and the history DB. Reads only: the history tables are never written here. Metadata only: costs, counts
 * and host names, never a prompt, a message or a user name.
 */
import type { DatabaseSync } from 'node:sqlite';
import { ERROR_WINDOW_MS, type AlertInput } from './alerts.ts';
import type { Config } from './config.ts';
import type { MachineRow } from './machines.ts';
import { createHistory } from './history/store.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The 7×24 hours of the baseline plus the current hour, which is the last bucket. */
const ERROR_BUCKETS = 7 * 24 + 1;

/**
 * The input of one evaluation. With no history DB (history disabled, or an old Node) the costs are zero and
 * the error and host lists are empty, so the silent and budget rules still work and the others stay quiet.
 */
export function alertInput(db: DatabaseSync | undefined, rows: MachineRow[], config: Config, now: number): AlertInput {
  return {
    now,
    profile: config.profile,
    enabled: config.alerts,
    machines: rows.map((r) => ({ id: r.sender, lastSeen: r.lastSeen, cadence: config.cadence?.[r.sender] })),
    budgets: config.budgets,
    alertThresholds: config.alertThresholds,
    ...historyInputs(db, now),
  };
}

type HistoryInputs = Pick<AlertInput, 'monthCost' | 'errorsByHour' | 'newHosts' | 'errorsBySender'>;

function historyInputs(db: DatabaseSync | undefined, now: number): HistoryInputs {
  if (!db) return { monthCost: { global: 0, projects: {} }, errorsByHour: [], newHosts: [], errorsBySender: [] };
  return {
    monthCost: monthCost(db, now),
    errorsByHour: errorsByHour(db, now),
    newHosts: newHosts(db, now),
    errorsBySender: errorsBySender(db, now),
  };
}

/**
 * Errors per sender in the last 15 minutes, for the errors rule. Only rows with a sender count: an event
 * with no sender has no machine to name in the alert. Reads the events table, which is where status lives.
 */
function errorsBySender(db: DatabaseSync, now: number): NonNullable<AlertInput['errorsBySender']> {
  const rows = db.prepare(
    "SELECT sender, COUNT(*) AS errors FROM events WHERE status = 'error' AND sender IS NOT NULL AND ts >= ? GROUP BY sender",
  ).all(now - ERROR_WINDOW_MS) as { sender: string; errors: number }[];
  return rows.map((r) => ({ sender: r.sender, errors: Number(r.errors) }));
}

/**
 * USD spent since the 1st of the current UTC month. Read through the store's totals, which sum the hourly
 * rollup for a range this short: the rollup already holds the cost in integer micros, so no event is scanned.
 */
function monthCost(db: DatabaseSync, now: number): HistoryInputs['monthCost'] {
  const at = new Date(now);
  const monthStart = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1);
  const projects: Record<string, number> = {};
  let global = 0;
  for (const row of createHistory(db).totals({ from: monthStart, to: now, by: ['project'] })) {
    const project = row.project ?? '';
    projects[project] = (projects[project] ?? 0) + row.cost_usd;
    global += row.cost_usd;
  }
  return { global, projects };
}

/**
 * Errors per hour across all senders, oldest first, the current hour last. Hours with no row count as zero:
 * a quiet hour is a real zero for the spike rule, not a gap in the series.
 */
function errorsByHour(db: DatabaseSync, now: number): number[] {
  const currentHour = Math.floor(now / HOUR) * HOUR;
  const first = currentHour - (ERROR_BUCKETS - 1) * HOUR;
  const out = new Array<number>(ERROR_BUCKETS).fill(0);
  const rows = db.prepare(
    'SELECT bucket, SUM(errors) AS errors FROM rollup_hourly WHERE bucket >= ? AND bucket <= ? GROUP BY bucket',
  ).all(first, currentHour) as { bucket: number; errors: number }[];
  for (const r of rows) out[(r.bucket - first) / HOUR] = Number(r.errors);
  return out;
}

/**
 * A host is new when its first event is within the last day and its sender had another host before it. A
 * sender with only one host has nothing to compare against, so its first host never counts as new.
 */
function newHosts(db: DatabaseSync, now: number): AlertInput['newHosts'] {
  const rows = db.prepare(
    "SELECT sender, host, MIN(ts) AS firstSeen FROM events WHERE sender IS NOT NULL AND host <> '' GROUP BY sender, host",
  ).all() as { sender: string; host: string; firstSeen: number }[];
  const bySender = new Map<string, { host: string; firstSeen: number }[]>();
  for (const r of rows) bySender.set(r.sender, [...(bySender.get(r.sender) ?? []), { host: r.host, firstSeen: Number(r.firstSeen) }]);

  const out: AlertInput['newHosts'] = [];
  for (const [sender, hosts] of bySender) {
    const earliest = Math.min(...hosts.map((h) => h.firstSeen));
    for (const h of hosts) {
      // Strictly later than the sender's earliest host: a tie at the earliest moment is not "an earlier host".
      if (h.firstSeen <= earliest || h.firstSeen < now - DAY) continue;
      out.push({ sender, host: h.host, firstSeen: h.firstSeen });
    }
  }
  return out;
}
