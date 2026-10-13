import { describe, expect, it } from 'vitest';
import { activeRules, alertsPill, type AlertsView, type HubAlert } from '../src/app/hub';

const alert = (over: Partial<HubAlert> = {}): HubAlert => ({
  id: 'silent:machine:laptop', rule: 'silent', level: 'warning', subject: { kind: 'machine', name: 'laptop' },
  message: 'laptop has been quiet for an hour', ...over,
});

const view = (alerts: HubAlert[], rules = [true, true, false, true]): AlertsView => ({
  alerts,
  rules: rules.map((enabled, i) => ({ id: `r${i}`, title: `Rule ${i}`, enabled })),
});

describe('alert pill', () => {
  it('is hidden at zero and while every alert is acked', () => {
    expect(alertsPill(undefined)).toBeUndefined();
    expect(alertsPill(view([]))).toBeUndefined();
    expect(alertsPill(view([alert({ acked: true })]))).toBeUndefined();
  });

  it('counts only unacked alerts', () => {
    expect(alertsPill(view([alert(), alert({ id: 'b', acked: true })]))).toEqual({ count: 1, level: 'warning' });
  });

  it('turns critical as soon as any unacked alert is critical', () => {
    const v = view([alert(), alert({ id: 'c', level: 'critical' })]);
    expect(alertsPill(v)).toEqual({ count: 2, level: 'critical' });
  });

  it('ignores an acked critical: it no longer asks for attention', () => {
    expect(alertsPill(view([alert({ level: 'critical', acked: true }), alert()]))).toEqual({ count: 1, level: 'warning' });
  });
});

describe('active rules', () => {
  it('counts the enabled rules, and is zero without a view', () => {
    expect(activeRules(view([], [true, false, true, true]))).toBe(3);
    expect(activeRules(undefined)).toBe(0);
  });
});
