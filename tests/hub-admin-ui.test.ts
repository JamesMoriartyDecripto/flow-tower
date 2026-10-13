import { describe, expect, it } from 'vitest';
import {
  addBudgetRow, addViewer, auditRows, budgetBody, confirmDeleteLabel, dayToMs, removeBudgetRow, removeViewer,
  retentionValid, revokeEnabled, ruleOn, senderIdValid, senderState, shortToken, parseUsd,
} from '../src/app/hud/hubAdminModel';
import { adminVisible } from '../src/app/hud/hubAdminModel';

describe('Hub admin: senders (#93)', () => {
  it('enables Revoke only when the typed text equals the sender id', () => {
    expect(revokeEnabled('dana', 'dana')).toBe(true);
    expect(revokeEnabled('dan', 'dana')).toBe(false);
    expect(revokeEnabled('Dana', 'dana')).toBe(false);
    expect(revokeEnabled('', '')).toBe(false);
  });

  it('accepts only ids the server accepts (a-z, 0-9, -, 1-32 chars)', () => {
    expect(senderIdValid('laptop-1')).toBe(true);
    expect(senderIdValid('Laptop')).toBe(false);
    expect(senderIdValid('')).toBe(false);
    expect(senderIdValid('a'.repeat(33))).toBe(false);
    expect(senderIdValid('a b')).toBe(false);
  });

  it('derives the state: revoked wins over paused, otherwise active', () => {
    expect(senderState({ paused: false, revoked: false })).toBe('active');
    expect(senderState({ paused: true, revoked: false })).toBe('paused');
    expect(senderState({ paused: true, revoked: true })).toBe('revoked');
  });

  it('shows only the id prefix once the token box is closed', () => {
    expect(shortToken('dana')).toBe('ft_dana…');
  });
});

describe('Hub admin: viewers (#93)', () => {
  it('adds a trimmed login once and ignores blanks and duplicates', () => {
    expect(addViewer(['a'], '  b ')).toEqual(['a', 'b']);
    expect(addViewer(['a'], 'a')).toEqual(['a']);
    expect(addViewer(['a'], '   ')).toEqual(['a']);
  });

  it('removes one login and leaves the rest in order', () => {
    expect(removeViewer(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('Hub admin: budgets (#93)', () => {
  it('reads an empty field as no limit and refuses negative or non-numeric amounts', () => {
    expect(parseUsd('')).toBeNull();
    expect(parseUsd(' 12.5 ')).toBe(12.5);
    expect(parseUsd('-1')).toBeUndefined();
    expect(parseUsd('abc')).toBeUndefined();
  });

  it('builds the body, leaving out an empty global and any cleared project', () => {
    const rows = [{ name: 'api', value: '40' }, { name: 'web', value: '' }];
    expect(budgetBody('100', rows)).toEqual({ global: 100, projects: { api: 40 } });
    expect(budgetBody('', rows)).toEqual({ projects: { api: 40 } });
  });

  it('refuses the whole body when one field is invalid', () => {
    expect(budgetBody('5', [{ name: 'api', value: 'x' }])).toBeUndefined();
    expect(budgetBody('-5', [])).toBeUndefined();
  });

  it('adds a named project row once and removes a row by index', () => {
    const rows = addBudgetRow([{ name: 'api', value: '1' }], 'web');
    expect(rows).toEqual([{ name: 'api', value: '1' }, { name: 'web', value: '' }]);
    expect(addBudgetRow(rows, 'api')).toBe(rows);
    expect(addBudgetRow(rows, '  ')).toBe(rows);
    expect(removeBudgetRow(rows, 0)).toEqual([{ name: 'web', value: '' }]);
  });
});

describe('Hub admin: retention (#93)', () => {
  it('keeps raw days between 1 and 21 whole', () => {
    expect(retentionValid(1)).toBe(true);
    expect(retentionValid(21)).toBe(true);
    expect(retentionValid(0)).toBe(false);
    expect(retentionValid(22)).toBe(false);
    expect(retentionValid(2.5)).toBe(false);
  });

  it('turns a date into local midnight and refuses a date that does not exist', () => {
    expect(dayToMs('2026-03-01')).toBe(new Date(2026, 2, 1).getTime());
    expect(dayToMs('2026-02-31')).toBeUndefined();
    expect(dayToMs('2026-3-1')).toBeUndefined();
    expect(dayToMs('')).toBeUndefined();
  });

  it('names the count on the second click', () => {
    expect(confirmDeleteLabel(3)).toBe('Delete 3 events?');
  });
});

describe('Hub admin: alerts and audit (#93)', () => {
  it('treats a rule as on unless the config says false', () => {
    expect(ruleOn({}, 'silent')).toBe(true);
    expect(ruleOn({ silent: false }, 'silent')).toBe(false);
    expect(ruleOn({ silent: true }, 'silent')).toBe(true);
  });

  it('keeps the newest 50 audit lines in the order the server sent them', () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({ ts: i, action: 'sender.pause', target: `s${i}` }));
    const rows = auditRows(entries);
    expect(rows).toHaveLength(50);
    expect(rows[0].target).toBe('s0');
    expect(rows[49].target).toBe('s49');
  });
});

describe('Hub admin: tab visibility (#93)', () => {
  it('shows the Admin tab only for a hub that is not a remote viewer', () => {
    expect(adminVisible({ hub: true, readOnly: false })).toBe(true);
    expect(adminVisible({ hub: true, readOnly: true })).toBe(false);
    expect(adminVisible({ hub: false, readOnly: false })).toBe(false);
    expect(adminVisible(undefined)).toBe(false);
  });
});
