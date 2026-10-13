/**
 * Pure helpers for the Hub Admin tab (#93). No React and no fetch here, so the rules the UI relies on
 * (when Revoke is enabled, how a budget field is read, what a retention day may be) can be unit tested.
 * The server validates the same things again; these checks only keep the operator from sending a bad body.
 */

export const CADENCE_OPTIONS = ['always-on', 'on-demand', 'scheduled'] as const;
export type Cadence = (typeof CADENCE_OPTIONS)[number];

/** Same shape the server accepts (src/server/hub-admin.ts ID): a sender id is 1-32 of a-z, 0-9 or -. */
const SENDER_ID = /^[a-z0-9-]{1,32}$/;

export const senderIdValid = (id: string): boolean => SENDER_ID.test(id);

export type SenderState = 'active' | 'paused' | 'revoked';

export function senderState(s: { paused: boolean; revoked: boolean }): SenderState {
  if (s.revoked) return 'revoked';
  return s.paused ? 'paused' : 'active';
}

/** Revoke is a destructive step: its button stays off until the operator types the sender id exactly. */
export const revokeEnabled = (typed: string, id: string): boolean => id !== '' && typed === id;

/**
 * What the panel shows for a token once the box is closed. The token itself is never kept after that,
 * so the only thing left on screen is the id and the first few characters of the token's form.
 */
export const shortToken = (id: string): string => `ft_${id}…`;

/**
 * True when the URL points at this machine only. Another machine cannot reach such an address, so the
 * connect line needs a warning. A URL that does not parse is not treated as loopback.
 */
export function isLoopbackUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  // URL keeps the brackets around an IPv6 literal; `localhost` covers the name, 127.x.x.x the whole IPv4 loopback block.
  return host === 'localhost' || host === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** The server URL inside a connect line (`flow-tower connect <url> --token ...`), or undefined if none. */
export function connectUrl(configLine: string): string | undefined {
  return /^flow-tower connect (\S+)/.exec(configLine)?.[1];
}

/** A budget field: empty means "not set", a non-negative number is a limit, anything else is refused. */
export function parseUsd(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** One editable project budget row. `value` stays text so a half-typed number is not lost on each keystroke. */
export interface BudgetRow { name: string; value: string }

/** Adds an empty row for a new project name. A blank or already listed name changes nothing. */
export function addBudgetRow(rows: BudgetRow[], name: string): BudgetRow[] {
  const n = name.trim();
  if (n === '' || rows.some((r) => r.name === n)) return rows;
  return [...rows, { name: n, value: '' }];
}

export const removeBudgetRow = (rows: BudgetRow[], index: number): BudgetRow[] =>
  rows.filter((_, i) => i !== index);

/**
 * The PUT /budgets body from the form, or undefined when a field is not a valid amount.
 * Rows with an empty value are left out: the operator cleared them, so the project has no limit.
 * `global` is left out (not sent as null) when empty: the server's schema takes a number or nothing.
 */
export function budgetBody(globalText: string, rows: BudgetRow[]):
  { global?: number; projects: Record<string, number> } | undefined {
  const global = parseUsd(globalText);
  if (global === undefined) return undefined;
  const projects: Record<string, number> = {};
  for (const r of rows) {
    const v = parseUsd(r.value);
    if (v === undefined) return undefined;
    if (v !== null) projects[r.name] = v;
  }
  return { ...(global === null ? {} : { global }), projects };
}

/** The Admin tab exists only for a hub that is not a remote viewer (#93): hidden, not greyed. */
export const adminVisible = (me?: { hub: boolean; readOnly: boolean }): boolean => !!me && me.hub && !me.readOnly;

/** Adds a viewer login. Blank or duplicate input is ignored so the list never holds the same login twice. */
export function addViewer(list: string[], text: string): string[] {
  const v = text.trim();
  if (v === '' || list.includes(v)) return list;
  return [...list, v];
}

export const removeViewer = (list: string[], v: string): string[] => list.filter((x) => x !== v);

/** Raw retention is kept between 1 and 21 days, the same range the server enforces. */
export const retentionValid = (days: number): boolean => Number.isInteger(days) && days >= 1 && days <= 21;

/**
 * The "Delete events before" date input (YYYY-MM-DD) as local midnight in ms, the unit the history
 * routes take. A date that does not exist (2026-02-31) is refused rather than rolled over to March.
 */
export function dayToMs(day: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return undefined;
  return date.getTime();
}

/** The second click's label: the count is named so the operator sees what the delete will remove. */
export const confirmDeleteLabel = (events: number): string => `Delete ${events} events?`;

export interface AuditRow { time: string; action: string; target: string }

/**
 * The audit log rows, newest first, at most `limit`. The server already sends newest first, so this only
 * caps the list; re-sorting here would hide a server-side ordering change instead of surfacing it.
 */
export function auditRows(entries: { ts: number; action: string; target: string }[], limit = 50): AuditRow[] {
  return entries.slice(0, limit).map((e) => ({ time: new Date(e.ts).toLocaleString(), action: e.action, target: e.target }));
}

/** An alert rule is on unless the config says `false`: the server treats a missing key as on too. */
export const ruleOn = (alerts: Record<string, boolean | undefined>, rule: string): boolean => alerts[rule] !== false;
