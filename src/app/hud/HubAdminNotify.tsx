import { useEffect, useState } from 'react';
import { type AdminView, type CallResult, type NotifyFormat } from './hubAdminApi';
// The test route sends a body-less POST; the empty object keeps the JSON content type check satisfied.
import { maskedHost, notifyUrlValid, thresholdValid } from './hubAdminModel';

type Change = (method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) => Promise<CallResult>;

const FORMATS: NotifyFormat[] = ['json', 'slack', 'telegram', 'ntfy'];

/**
 * Notifications (#191): the webhook the hub posts alerts to, and the errors threshold. The url is typed
 * here but never read back: the view only carries its masked host, so a reload cannot show the token.
 */
export function NotifySection({ notify, thresholds, change }: {
  notify: AdminView['notify'];
  thresholds: AdminView['alertThresholds'];
  change: Change;
}) {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<NotifyFormat>('ntfy');
  const [bad, setBad] = useState(false);
  // Its own flag: the threshold field must not show the webhook's error text, nor clear it.
  const [badErrors, setBadErrors] = useState(false);
  const [testResult, setTestResult] = useState<string>();
  const [errors, setErrors] = useState(String(thresholds.errors ?? 3));
  // The typed value wins over a refresh while the user is editing it; a save hands the field back to the view.
  const [errorsDirty, setErrorsDirty] = useState(false);
  // The view arrives after mount and again after every save: follow it unless the user is typing.
  useEffect(() => {
    if (!errorsDirty) setErrors(String(thresholds.errors ?? 3));
  }, [thresholds.errors, errorsDirty]);

  const save = async () => {
    const ok = notifyUrlValid(url);
    setBad(!ok);
    if (!ok) return;
    const r = await change('PUT', '/notify', { url, format });
    // The field is cleared on success so the url does not stay on screen after it was stored.
    if (r.ok) setUrl('');
  };

  const test = async () => {
    setTestResult(undefined);
    const r = await change('POST', '/notify/test', {});
    if (r.ok) {
      const d = r.data as { ok: boolean; status?: number };
      setTestResult(d.ok ? 'Test alert sent' : `Test alert failed${d.status ? ` (HTTP ${d.status})` : ''}`);
    }
  };

  const saveErrors = async () => {
    const n = Number(errors);
    setBadErrors(!thresholdValid(n));
    if (!thresholdValid(n)) return;
    const r = await change('PUT', '/thresholds', { errors: n });
    if (r.ok) setErrorsDirty(false);
  };

  return (
    <section className="admin-section" aria-label="Notifications">
      <h3>Notifications</h3>
      {notify.set ? (
        <div className="admin-line">
          <span className="hub-cell mono" title={notify.host}>{maskedHost(notify.host ?? '')}</span>
          <span className="chip">{notify.format}</span>
          <button className="btn" onClick={() => void test()}>Send a test alert</button>
          <button className="btn" onClick={() => void change('DELETE', '/notify')}>Remove</button>
        </div>
      ) : (
        <p className="hub-empty">No webhook set.</p>
      )}
      {testResult && <p className="hub-empty">{testResult}</p>}
      <div className="admin-line">
        <input className="admin-input" type="url" aria-label="Webhook URL" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        <select className="admin-select" aria-label="Webhook format" value={format} onChange={(e) => setFormat(e.target.value as NotifyFormat)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button className="btn" disabled={url.trim() === ''} onClick={() => void save()}>{notify.set ? 'Replace' : 'Set'}</button>
      </div>
      {bad && <p className="hub-warn">The webhook must be https://, or http:// to this machine</p>}
      <div className="admin-line">
        <span>Errors per machine (15 min)</span>
        <input className="admin-input" type="number" min={1} max={1000} aria-label="Errors threshold" value={errors} onChange={(e) => { setErrors(e.target.value); setErrorsDirty(true); }} />
        <button className="btn" onClick={() => void saveErrors()}>Save</button>
      </div>
      {badErrors && <p className="hub-warn">A number from 1 to 1000</p>}
    </section>
  );
}
