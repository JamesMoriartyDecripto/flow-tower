/**
 * Hub alerts (#94): four rules over the machines, the budgets, the error counts and the new hosts the hub
 * already knows. Pure: no I/O and no clock read, `now` is passed in, so every rule is testable with a fake
 * clock. Metadata only: a message names a machine id, a project, a sender or a host, never a prompt, a
 * message or a user name (the employees profile depends on that).
 */
import type { Cadence, Profile } from './config.ts';

export const RULES = ['silent', 'budget', 'error-spike', 'new-host', 'errors'] as const;
export type Rule = (typeof RULES)[number];

/** One-line titles the UI shows next to each rule's switch. */
export const RULE_TITLES: Record<Rule, string> = {
  silent: 'A machine that should be running has stopped reporting',
  budget: 'Monthly spend is close to or over a budget',
  'error-spike': 'Errors in the current hour are far above the usual rate',
  'new-host': 'A token was used from a host it has not used before',
  errors: 'A machine is reporting errors',
};

export interface Alert {
  /** Stable across runs: the rule plus the subject, so an ack or a snooze keeps pointing at the same alert. */
  id: string;
  rule: Rule;
  level: 'warning' | 'critical';
  subject: { kind: 'machine' | 'project' | 'global' | 'hub'; name: string };
  message: string;
  /** When the condition began, if known. */
  since?: number;
  /** Set by applyAcks: the alert is still listed, but the operator has acknowledged it. */
  acked?: boolean;
}

export interface AlertInput {
  now: number;
  profile?: Profile;
  /** config.alerts: a rule set to false is off. Every rule is on when this is omitted. */
  enabled?: Partial<Record<Rule, boolean>>;
  machines: { id: string; lastSeen?: number; cadence?: Cadence }[];
  /** USD per calendar month. */
  budgets?: { global?: number; projects?: Record<string, number> };
  /** USD spent this calendar month. */
  monthCost: { global: number; projects: Record<string, number> };
  /** Errors per hour, oldest first: the last 7 days plus the current hour last. */
  errorsByHour: number[];
  newHosts: { sender: string; host: string; firstSeen: number }[];
  /** Errors per sender in the last ERROR_WINDOW_MS, filled by alert-inputs.ts. Omitted means none. */
  errorsBySender?: { sender: string; errors: number }[];
  /** config.alertThresholds: per-rule numbers. */
  alertThresholds?: { errors?: number };
}

export interface AckState {
  /** Alert id to the time it was acknowledged. */
  acked: Record<string, number>;
  /** Alert id to the time until which it is hidden. */
  snoozed: Record<string, number>;
  /**
   * Alert id to the time its open was sent to the webhook (#191). Optional: a state file written before the
   * notifier existed has no such key, and reads back without it.
   */
  notified?: Record<string, number>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The window the errors rule counts over: alert-inputs.ts queries exactly this span. */
export const ERROR_WINDOW_MS = 15 * MINUTE;
/** Errors from one machine in the window that make the rule fire, unless config.alertThresholds says otherwise. */
const ERROR_THRESHOLD = 3;

/** Three times the 5-minute recent window of machines.ts: a machine may miss a beat or two before it counts as silent. */
const ALWAYS_ON_SILENT_MS = 15 * MINUTE;
/** A scheduled machine runs once a day, so anything under a day plus a margin is still on schedule. */
const SCHEDULED_SILENT_MS = 26 * HOUR;
const BUDGET_WARN = 0.8;
const SPIKE_FACTOR = 3;
/** Below this many errors an hour is noise: a quiet hub must not alert on 1 error against a median of 0. */
const SPIKE_FLOOR = 5;
const HISTORY_HOURS = 7 * 24;
const NEW_HOST_MS = DAY;

// Sub-cent amounts get 4 decimals: at 2 a 0.004 budget reads "$0.00", which hides what the alert is about.
// Same rule as the live cost in src/app/live.ts.
const usd = (n: number) => `$${n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
const hours = (ms: number) => `${Math.floor(ms / HOUR)} h`;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function silentAlerts(input: AlertInput): Alert[] {
  const out: Alert[] = [];
  for (const m of input.machines) {
    // A machine never seen does not alert: it may simply not be set up yet, which is not a stop.
    if (m.lastSeen === undefined) continue;
    const quietFor = input.now - m.lastSeen;
    const limit = m.cadence === 'always-on' ? ALWAYS_ON_SILENT_MS : m.cadence === 'scheduled' ? SCHEDULED_SILENT_MS : undefined;
    // on-demand (and no cadence) is silent by design, so it never alerts.
    if (limit === undefined || quietFor <= limit) continue;
    out.push({
      id: `silent:machine:${m.id}`,
      rule: 'silent',
      level: 'warning',
      subject: { kind: 'machine', name: m.id },
      message: `${m.id} has not reported for ${hours(quietFor)} (${m.cadence})`,
      since: m.lastSeen,
    });
  }
  return out;
}

/** The level a spend ratio earns, or undefined below the warning line. */
const budgetLevel = (ratio: number): Alert['level'] | undefined =>
  ratio >= 1 ? 'critical' : ratio >= BUDGET_WARN ? 'warning' : undefined;

function budgetAlert(subject: Alert['subject'], spent: number, budget: number): Alert | undefined {
  if (!(budget > 0)) return undefined; // a zero or unset budget has nothing to measure against
  const level = budgetLevel(spent / budget);
  if (!level) return undefined;
  const percent = Math.floor((spent / budget) * 100);
  return {
    id: `budget:${subject.kind}:${subject.name}`,
    rule: 'budget',
    level,
    subject,
    message: `${subject.name} at ${percent}% of its monthly budget (${usd(spent)} of ${usd(budget)})`,
  };
}

function budgetAlerts(input: AlertInput): Alert[] {
  const out: Alert[] = [];
  const budgets = input.budgets ?? {};
  if (budgets.global !== undefined) {
    const a = budgetAlert({ kind: 'global', name: 'hub' }, input.monthCost.global, budgets.global);
    if (a) out.push(a);
  }
  for (const [project, budget] of Object.entries(budgets.projects ?? {})) {
    const a = budgetAlert({ kind: 'project', name: project }, input.monthCost.projects[project] ?? 0, budget);
    if (a) out.push(a);
  }
  return out;
}

function errorSpikeAlerts(input: AlertInput): Alert[] {
  const hourly = input.errorsByHour;
  if (hourly.length === 0) return [];
  const current = hourly[hourly.length - 1]!;
  // The baseline is the 7×24 hours before the current one, not the whole array: a spike is judged against
  // what the hub usually sees, and the current hour must not count toward its own baseline.
  const baseline = median(hourly.slice(Math.max(0, hourly.length - 1 - HISTORY_HOURS), -1));
  if (current < SPIKE_FLOOR || current <= SPIKE_FACTOR * baseline) return [];
  return [{
    id: 'error-spike:hub:hub',
    rule: 'error-spike',
    level: 'warning',
    subject: { kind: 'hub', name: 'hub' },
    message: `${current} errors this hour, against a usual median of ${baseline} per hour`,
  }];
}

function newHostAlerts(input: AlertInput): Alert[] {
  // The input only holds senders that had other hosts before, so the rule itself is just the 24 h window.
  return input.newHosts
    .filter((h) => input.now - h.firstSeen <= NEW_HOST_MS)
    .map((h) => ({
      id: `new-host:machine:${h.sender}:${h.host}`,
      rule: 'new-host' as const,
      level: 'warning' as const,
      subject: { kind: 'machine' as const, name: h.sender },
      // Names the sender and the host only: under the employees profile no person is named in an alert.
      message: `${h.sender} used a token from a new host: ${h.host}`,
      since: h.firstSeen,
    }));
}

function errorsAlerts(input: AlertInput): Alert[] {
  // A machine with a few errors in 15 minutes is the early sign; the window itself is applied by the query.
  const threshold = input.alertThresholds?.errors ?? ERROR_THRESHOLD;
  return (input.errorsBySender ?? [])
    .filter((s) => s.errors >= threshold)
    .map((s) => ({
      id: `errors:machine:${s.sender}`,
      rule: 'errors' as const,
      level: 'warning' as const,
      subject: { kind: 'machine' as const, name: s.sender },
      message: `${s.sender}: ${s.errors} errors in the last 15 min`,
    }));
}

const RULE_FNS: Record<Rule, (input: AlertInput) => Alert[]> = {
  silent: silentAlerts,
  budget: budgetAlerts,
  'error-spike': errorSpikeAlerts,
  'new-host': newHostAlerts,
  errors: errorsAlerts,
};

/**
 * Every alert firing now, critical first, then rule order, then subject name. A rule switched off in
 * `enabled` produces nothing. Pure: the same input always gives the same list.
 */
export function evaluateAlerts(input: AlertInput): Alert[] {
  const alerts = RULES
    .filter((rule) => input.enabled?.[rule] !== false)
    .flatMap((rule) => RULE_FNS[rule](input));
  const levelRank = (a: Alert) => (a.level === 'critical' ? 0 : 1);
  return alerts.sort((a, b) =>
    levelRank(a) - levelRank(b) ||
    RULES.indexOf(a.rule) - RULES.indexOf(b.rule) ||
    a.subject.name.localeCompare(b.subject.name));
}

/**
 * Applies the operator's acks and snoozes. A snoozed alert is dropped until its time; an acked one stays
 * listed with `acked: true`, since an ack hides nothing, it only says someone has seen it.
 */
export function applyAcks(alerts: Alert[], state: AckState, now: number): Alert[] {
  return alerts
    .filter((a) => (state.snoozed[a.id] ?? 0) <= now)
    .map((a) => (state.acked[a.id] !== undefined ? { ...a, acked: true } : a));
}

/**
 * Drops ack and snooze entries whose alert no longer fires. Without this an ack would outlive its
 * condition, and a later, different breach under the same id would arrive already acknowledged.
 * Returns a new state: the input is never mutated.
 */
export function pruneState(state: AckState, alerts: Alert[]): AckState {
  const live = new Set(alerts.map((a) => a.id));
  const keep = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).filter(([id]) => live.has(id)));
  // `notified` is deliberately not pruned here: an alert that stopped firing still owes its clear, and the
  // notifier (hub-alerts.ts) drops that entry itself once the clear has been sent.
  return {
    acked: keep(state.acked),
    snoozed: keep(state.snoozed),
    ...(state.notified ? { notified: state.notified } : {}),
  };
}
