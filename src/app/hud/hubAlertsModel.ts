/**
 * Pure helpers for the browser notices of the Alerts tab (#191). No DOM and no Notification API here, so
 * the rule "which alerts are new" is unit tested on its own; HubAlerts.tsx does the showing.
 */

/** The fields the notice needs; the full HubAlert from hub.ts has more, but only these matter here. */
export interface NoticeAlert { id: string; message: string; acked?: boolean }

/**
 * The alerts in `current` that were not in `previous` and are not acked. `previous` undefined means this is
 * the first poll after load: nothing is new yet, so a page that opens on a firing alert does not pop a
 * notice for each one it already shows.
 */
export function newAlerts(previous: readonly NoticeAlert[] | undefined, current: readonly NoticeAlert[]): NoticeAlert[] {
  if (previous === undefined) return [];
  const seen = new Set(previous.map((a) => a.id));
  return current.filter((a) => !a.acked && !seen.has(a.id));
}

const KEY = 'flow-tower.hub.notify';

/**
 * Whether this browser asked for notices. localStorage can be missing or refuse access (private modes,
 * a sandboxed frame), and then the switch just stays off: a notice feature must never break the tab.
 */
export function readNotifyOptIn(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeNotifyOptIn(on: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): void {
  try {
    if (on) storage?.setItem(KEY, '1');
    else storage?.removeItem(KEY);
  } catch {
    // Storage refused: the switch still works for this page view, it just is not remembered.
  }
}
