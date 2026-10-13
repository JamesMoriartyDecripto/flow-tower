import { describe, expect, it } from 'vitest';
import { newAlerts, readNotifyOptIn, writeNotifyOptIn } from '../src/app/hud/hubAlertsModel';

const a = (id: string, acked = false) => ({ id, message: `${id} message`, acked });

describe('newAlerts (#191)', () => {
  it('is empty on the first poll after load, so a page opened on a firing alert stays quiet', () => {
    expect(newAlerts(undefined, [a('silent:machine:x')])).toEqual([]);
  });

  it('returns the alerts that were not in the previous poll', () => {
    expect(newAlerts([a('silent:machine:x')], [a('silent:machine:x'), a('errors:machine:y')]).map((x) => x.id)).toEqual(['errors:machine:y']);
  });

  it('never returns an acked alert', () => {
    expect(newAlerts([], [a('budget:global:all', true)])).toEqual([]);
  });

  it('returns nothing when every alert was already seen', () => {
    expect(newAlerts([a('x:a:b')], [a('x:a:b')])).toEqual([]);
  });
});

describe('notify opt-in storage (#191)', () => {
  const memory = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('remembers the switch per browser and clears it when turned off', () => {
    const s = memory();
    expect(readNotifyOptIn(s)).toBe(false);
    writeNotifyOptIn(true, s);
    expect(readNotifyOptIn(s)).toBe(true);
    writeNotifyOptIn(false, s);
    expect(readNotifyOptIn(s)).toBe(false);
  });

  it('treats refused storage as off instead of throwing', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(readNotifyOptIn(broken)).toBe(false);
    expect(() => writeNotifyOptIn(true, broken)).not.toThrow();
  });
});
