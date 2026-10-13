import { useState, type KeyboardEvent } from 'react';
import { activeRules, type AlertsView, type HubAlert } from '../hub';

/**
 * Reads GET /api/hub/alerts and hands the answer to `set`. A failed read leaves the old view in place
 * on purpose: a blip must not make a firing alert vanish from the pill. The store owns the state, so
 * this file needs no store import (Hub.tsx imports this one, and a cycle would be fragile).
 */
export async function readAlerts(set: (v: AlertsView | undefined) => void, signal?: AbortSignal): Promise<void> {
  try {
    const res = await fetch('/api/hub/alerts', { signal });
    if (!res.ok) throw new Error(String(res.status));
    set((await res.json()) as AlertsView);
  } catch {
    // Our own abort is a cleanup, not a hub that went away; only a real failure is reported.
  }
}

/** POST one ack or snooze to the loopback-only routes; resolves to whether the hub stored it. */
async function act(path: 'ack' | 'snooze', id: string, extra?: { for: '1h' | '1d' }): Promise<boolean> {
  try {
    const res = await fetch(`/api/hub/alerts/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...extra }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const LEVEL_LABEL: Record<HubAlert['level'], string> = { warning: 'WARN', critical: 'CRIT' };

/**
 * The Alerts tab. Remote viewers get the list only: the buttons and the A key are not rendered for
 * them, rather than greyed out, because the hub refuses those requests from a remote viewer anyway.
 */
export function AlertsTab({ view, canAct, onChanged }: {
  view?: AlertsView;
  canAct: boolean;
  onChanged: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!view) return <p className="hub-empty">Alerts unavailable</p>;
  if (!view.alerts.length) {
    return <p className="hub-empty">No alerts. {activeRules(view)} rules active.</p>;
  }

  // Each action refreshes the view afterwards, so the row moves to its acked state or leaves the list.
  const run = async (path: 'ack' | 'snooze', id: string, extra?: { for: '1h' | '1d' }) => {
    setFailed(!(await act(path, id, extra)));
    onChanged();
  };

  // A is the keyboard ack for the focused row; an already acked row has nothing left to do.
  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, a: HubAlert) => {
    if (!canAct || a.acked || (e.key !== 'a' && e.key !== 'A')) return;
    // Stop here: App.tsx listens on window and lowercases keys, so the same A would reach the scene too.
    e.preventDefault();
    e.stopPropagation();
    void run('ack', a.id);
  };

  return (
    <>
      {failed && <p className="hub-warn">The hub did not store that change</p>}
      <div className="hub-rows alerts" role="list">
        {view.alerts.map((a) => (
          <div className={`hub-row alert ${a.level}${a.acked ? ' acked' : ''}`} key={a.id} role="listitem"
            tabIndex={canAct ? 0 : undefined}
            aria-label={`${LEVEL_LABEL[a.level]} ${a.subject.name}: ${a.message}${a.acked ? ' (acked)' : ''}`}
            onKeyDown={(e) => onRowKey(e, a)}>
            <div className="hub-main">
              <span className={`chip alert-level ${a.level}`}>{LEVEL_LABEL[a.level]}</span>
              <span className="hub-sender" title={a.rule}>{a.rule}</span>
              <span className="hub-cell" title={a.subject.name}>{a.subject.name}</span>
              {a.acked && <span className="hub-right">acked</span>}
            </div>
            <div className="hub-meta">
              <span className="hub-cell" title={a.message}>{a.message}</span>
            </div>
            {canAct && (
              <div className="alert-actions">
                {!a.acked && <button className="btn" onClick={() => void run('ack', a.id)}>Ack</button>}
                <button className="btn" onClick={() => void run('snooze', a.id, { for: '1h' })}>Snooze 1h</button>
                <button className="btn" onClick={() => void run('snooze', a.id, { for: '1d' })}>Snooze 1d</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
