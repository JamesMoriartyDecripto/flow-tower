import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { applyAcks, evaluateAlerts, pruneState, type AlertInput } from '../src/server/alerts.ts';

const NOW = Date.UTC(2025, 5, 15, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

/** A quiet hub: nothing fires unless a test sets it up. */
const base = (over: Partial<AlertInput> = {}): AlertInput => ({
  now: NOW,
  machines: [],
  monthCost: { global: 0, projects: {} },
  errorsByHour: [],
  newHosts: [],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('silent rule', () => {
  it('fires for an always-on machine quiet for more than 15 minutes, and clears at exactly 15', () => {
    const quiet = base({ machines: [{ id: 'mac', cadence: 'always-on', lastSeen: NOW - 16 * MIN }] });
    expect(evaluateAlerts(quiet).map((a) => a.id)).toEqual(['silent:machine:mac']);
    const edge = base({ machines: [{ id: 'mac', cadence: 'always-on', lastSeen: NOW - 15 * MIN }] });
    expect(evaluateAlerts(edge)).toEqual([]);
  });

  it('fires for a scheduled machine quiet for more than 26 hours', () => {
    const late = base({ machines: [{ id: 'ci', cadence: 'scheduled', lastSeen: NOW - 27 * HOUR }] });
    expect(evaluateAlerts(late)[0]).toMatchObject({ rule: 'silent', level: 'warning' });
    const ok = base({ machines: [{ id: 'ci', cadence: 'scheduled', lastSeen: NOW - 25 * HOUR }] });
    expect(evaluateAlerts(ok)).toEqual([]);
  });

  it('never alerts for on-demand, no cadence, or a machine never seen', () => {
    const quiet = NOW - 10 * 24 * HOUR;
    expect(evaluateAlerts(base({ machines: [{ id: 'laptop', cadence: 'on-demand', lastSeen: quiet }] }))).toEqual([]);
    expect(evaluateAlerts(base({ machines: [{ id: 'anon', lastSeen: quiet }] }))).toEqual([]);
    expect(evaluateAlerts(base({ machines: [{ id: 'new', cadence: 'always-on' }] }))).toEqual([]);
  });
});

describe('budget rule', () => {
  const budget = (spent: number) =>
    evaluateAlerts(base({ budgets: { projects: { invoicing: 100 } }, monthCost: { global: 0, projects: { invoicing: spent } } }));

  it('stays quiet at 79%, warns at 80%, and is critical at 100%', () => {
    expect(budget(79)).toEqual([]);
    expect(budget(80)[0]).toMatchObject({ id: 'budget:project:invoicing', level: 'warning' });
    expect(budget(100)[0]).toMatchObject({ id: 'budget:project:invoicing', level: 'critical' });
  });

  it('words the message with the percentage and two-decimal amounts', () => {
    expect(budget(85.5)[0]!.message).toBe('invoicing at 85% of its monthly budget ($85.50 of $100.00)');
  });

  it('words sub-cent amounts with 4 decimals instead of "$0.00 of $0.00"', () => {
    const alerts = evaluateAlerts(base({ budgets: { projects: { invoicing: 0.004 } }, monthCost: { global: 0, projects: { invoicing: 0.0034 } } }));
    expect(alerts[0]!.message).toBe('invoicing at 85% of its monthly budget ($0.0034 of $0.0040)');
  });

  it('applies the global budget as its own subject', () => {
    const alerts = evaluateAlerts(base({ budgets: { global: 50 }, monthCost: { global: 60, projects: {} } }));
    expect(alerts).toEqual([expect.objectContaining({ id: 'budget:global:hub', level: 'critical' })]);
  });
});

describe('error-spike rule', () => {
  const hourly = (current: number, baseline = 0) => [...Array(7 * 24).fill(baseline), current];

  it('fires when the current hour is over 3x the median and at least 5 errors', () => {
    const alerts = evaluateAlerts(base({ errorsByHour: hourly(10, 2) }));
    expect(alerts).toEqual([expect.objectContaining({ id: 'error-spike:hub:hub', rule: 'error-spike', level: 'warning' })]);
  });

  it('clears when the rate is back within 3x the median', () => {
    expect(evaluateAlerts(base({ errorsByHour: hourly(6, 2) }))).toEqual([]);
  });

  it('does not alert on 4 errors against a median of 0 (the floor)', () => {
    expect(evaluateAlerts(base({ errorsByHour: hourly(4, 0) }))).toEqual([]);
  });
});

describe('new-host rule', () => {
  it('fires for a host first seen within the last 24 hours and clears after', () => {
    const fresh = base({ newHosts: [{ sender: 'mac', host: 'build-7', firstSeen: NOW - 2 * HOUR }] });
    expect(evaluateAlerts(fresh)[0]).toMatchObject({ rule: 'new-host', subject: { kind: 'machine', name: 'mac' } });
    const old = base({ newHosts: [{ sender: 'mac', host: 'build-7', firstSeen: NOW - 25 * HOUR }] });
    expect(evaluateAlerts(old)).toEqual([]);
  });
});

describe('evaluateAlerts', () => {
  it('honours config.alerts: a rule set to false never fires', () => {
    const input = base({ machines: [{ id: 'mac', cadence: 'always-on', lastSeen: NOW - HOUR }], enabled: { silent: false } });
    expect(evaluateAlerts(input)).toEqual([]);
    expect(evaluateAlerts({ ...input, enabled: {} }).length).toBe(1);
  });

  it('lists critical first, then rule order, then subject name', () => {
    const alerts = evaluateAlerts(base({
      machines: [{ id: 'b', cadence: 'always-on', lastSeen: NOW - HOUR }, { id: 'a', cadence: 'always-on', lastSeen: NOW - HOUR }],
      budgets: { projects: { x: 10, y: 10 } },
      monthCost: { global: 0, projects: { x: 12, y: 9 } },
    }));
    // x is critical (120%) so it leads; then the warnings in rule order (silent before budget), so y comes last.
    expect(alerts.map((a) => a.id)).toEqual(['budget:project:x', 'silent:machine:a', 'silent:machine:b', 'budget:project:y']);
  });

  it('never names a user in the employees profile, only machines and hosts', () => {
    const alerts = evaluateAlerts(base({
      profile: 'employees',
      newHosts: [{ sender: 'mac', host: 'build-7', firstSeen: NOW - HOUR }],
      machines: [{ id: 'mac', cadence: 'always-on', lastSeen: NOW - HOUR }],
    }));
    const text = JSON.stringify(alerts);
    expect(text).not.toMatch(/alice|bob|user/i);
    expect(alerts.find((a) => a.rule === 'new-host')!.message).toBe('mac used a token from a new host: build-7');
  });
});

describe('applyAcks and pruneState', () => {
  const alerts = evaluateAlerts(base({ machines: [{ id: 'mac', cadence: 'always-on', lastSeen: NOW - HOUR }] }));
  const id = 'silent:machine:mac';

  it('hides a snoozed alert until its time, then shows it again', () => {
    const state = { acked: {}, snoozed: { [id]: NOW + HOUR } };
    expect(applyAcks(alerts, state, NOW)).toEqual([]);
    expect(applyAcks(alerts, state, NOW + HOUR)).toHaveLength(1);
  });

  it('marks an acked alert but keeps it listed', () => {
    const out = applyAcks(alerts, { acked: { [id]: NOW }, snoozed: {} }, NOW);
    expect(out).toEqual([expect.objectContaining({ id, acked: true })]);
    expect(alerts[0]!.acked).toBeUndefined();
  });

  it('prunes ack and snooze entries whose alert is gone, without mutating the input', () => {
    const state = { acked: { [id]: NOW, 'budget:global:hub': NOW }, snoozed: { 'error-spike:hub:hub': NOW + HOUR } };
    const pruned = pruneState(state, alerts);
    expect(pruned).toEqual({ acked: { [id]: NOW }, snoozed: {} });
    expect(state.acked['budget:global:hub']).toBe(NOW);
  });
});
