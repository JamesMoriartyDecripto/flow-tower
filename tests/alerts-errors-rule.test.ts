import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateAlerts, RULES, RULE_TITLES, ERROR_WINDOW_MS, type AlertInput } from '../src/server/alerts';
import { alertInput } from '../src/server/alert-inputs';
import { openHistory } from '../src/server/history/db';
import type { Config } from '../src/server/config';

const NOW = Date.UTC(2025, 5, 10, 12, 0, 0);
const MINUTE = 60_000;

/** An input with every other rule quiet, so only the errors rule can answer. */
const input = (errorsBySender: AlertInput['errorsBySender'], alertThresholds?: AlertInput['alertThresholds']): AlertInput => ({
  now: NOW,
  machines: [],
  monthCost: { global: 0, projects: {} },
  errorsByHour: [],
  newHosts: [],
  errorsBySender,
  alertThresholds,
});

describe('errors rule: a machine reporting errors', () => {
  it('is a registered rule with a title', () => {
    expect(RULES).toContain('errors');
    expect(RULE_TITLES.errors).toBe('A machine is reporting errors');
  });

  it('fires at the default threshold of 3, with the id and message the lead sees', () => {
    const [alert] = evaluateAlerts(input([{ sender: 'dana', errors: 3 }]));
    expect(alert).toEqual({
      id: 'errors:machine:dana',
      rule: 'errors',
      level: 'warning',
      subject: { kind: 'machine', name: 'dana' },
      message: 'dana: 3 errors in the last 15 min',
    });
  });

  it('stays quiet below the default threshold', () => {
    expect(evaluateAlerts(input([{ sender: 'dana', errors: 2 }]))).toEqual([]);
  });

  it('honours alertThresholds.errors in both directions', () => {
    expect(evaluateAlerts(input([{ sender: 'dana', errors: 5 }], { errors: 6 }))).toEqual([]);
    expect(evaluateAlerts(input([{ sender: 'dana', errors: 2 }], { errors: 2 }))).toHaveLength(1);
  });

  it('fires once per machine, not once for the hub', () => {
    const alerts = evaluateAlerts(input([{ sender: 'dana', errors: 4 }, { sender: 'lee', errors: 9 }, { sender: 'kim', errors: 1 }]));
    // Same level, so the order falls to the subject name: dana before lee.
    expect(alerts.map((a) => a.id)).toEqual(['errors:machine:dana', 'errors:machine:lee']);
  });

  it('is off when the operator switches the rule off', () => {
    const off = { ...input([{ sender: 'dana', errors: 9 }]), enabled: { errors: false } };
    expect(evaluateAlerts(off)).toEqual([]);
  });
});

describe('errors input: the 15-minute window and the sender query', () => {
  const config = {} as Config;
  const open = () => openHistory(join(mkdtempSync(join(tmpdir(), 'flow-tower-errors-')), 'history.db'));
  const insert = (db: import('node:sqlite').DatabaseSync, ts: number, sender: string | null, status: string | null) =>
    db.prepare('INSERT INTO events (ts, sender, status, event_key) VALUES (?, ?, ?, ?)').run(ts, sender, status, `k${Math.random()}`);

  it('counts only error rows inside the window, grouped by sender, and skips rows with no sender', async () => {
    const res = await open();
    if ('disabled' in res) return;
    const { db } = res;
    // Inside the window: three errors for dana, one ok row, one error with no sender.
    insert(db, NOW - MINUTE, 'dana', 'error');
    insert(db, NOW - 2 * MINUTE, 'dana', 'error');
    insert(db, NOW - 3 * MINUTE, 'dana', 'error');
    insert(db, NOW - MINUTE, 'dana', 'ok');
    insert(db, NOW - MINUTE, null, 'error');
    // Outside the window: three old errors are not counted for the last 15 minutes.
    insert(db, NOW - ERROR_WINDOW_MS - MINUTE, 'lee', 'error');
    insert(db, NOW - ERROR_WINDOW_MS - MINUTE, 'lee', 'error');
    insert(db, NOW - ERROR_WINDOW_MS - MINUTE, 'lee', 'error');

    const built = alertInput(db, [], config, NOW);
    expect(built.errorsBySender).toEqual([{ sender: 'dana', errors: 3 }]);
    const alerts = evaluateAlerts(built);
    expect(alerts.map((a) => a.id)).toEqual(['errors:machine:dana']);
  });

  it('is empty without a history DB', () => {
    expect(alertInput(undefined, [], config, NOW).errorsBySender).toEqual([]);
  });
});
