import { useCallback, useEffect, useState } from 'react';
import { callAdmin, type AdminSender, type AdminView, type CallResult } from './hubAdminApi';
import {
  CADENCE_OPTIONS, addBudgetRow, addViewer, auditRows, budgetBody, confirmDeleteLabel, dayToMs, removeBudgetRow,
  DEFAULT_CADENCE, cadenceOf, connectUrl, isLoopbackUrl, removeViewer, retentionValid, revokeEnabled, ruleOn, senderIdValid, senderState, shortToken,
  type BudgetRow, type Cadence,
} from './hubAdminModel';
import { RULE_LABEL } from './HubAlerts';

/** The alert rules the server knows (src/server/alerts.ts RULES). The browser keeps its own copy: the server module is Node only. */
const RULES = ['silent', 'budget', 'error-spike', 'new-host'];

/** What the add-sender box shows once: the token and the connect line. Held only while the box is open. */
interface Shown { id: string; token: string; configLine: string }

/**
 * The Admin tab (#93). Mounted by Hub.tsx only for a hub that is not a remote viewer, so no control here
 * has to guard itself against a viewer. Every change posts to /api/hub/admin, then refetches the view;
 * the server message is shown inline when a change is refused.
 */
export function HubAdmin() {
  const [view, setView] = useState<AdminView>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const r = await callAdmin<AdminView>('GET', '');
    if (r.ok) setView(r.data);
    else setError(r.error);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** One change: post it, show a refusal, then refetch so the panel always shows what the server stored. */
  const change = useCallback(async (method: 'POST' | 'PUT', path: string, body?: unknown): Promise<CallResult> => {
    const r = await callAdmin(method, path, body);
    setError(r.ok ? undefined : r.error);
    await load();
    return r;
  }, [load]);

  if (!view) return <p className="hub-empty">{error ?? 'Admin unavailable'}</p>;

  return (
    <div className="admin">
      {error && <p className="hub-warn admin-error" role="alert">{error}</p>}
      <SendersSection senders={view.senders} cadence={view.cadence} change={change} />
      <ViewersSection viewers={view.viewers} change={change} />
      <BudgetsSection budgets={view.budgets} change={change} />
      <AlertsSection alerts={view.alerts} change={change} />
      <RetentionSection days={view.retentionDays} change={change} />
      <AuditSection audit={view.audit} />
    </div>
  );
}

type Change = (method: 'POST' | 'PUT', path: string, body?: unknown) => Promise<CallResult>;

/** Senders: list, cadence, pause/resume, revoke (typed confirmation), and add (token shown once). */
function SendersSection({ senders, cadence, change }: { senders: AdminSender[]; cadence: AdminView['cadence']; change: Change }) {
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState('');
  const [newCadence, setNewCadence] = useState<Cadence>(DEFAULT_CADENCE);
  const [shown, setShown] = useState<Shown>();
  const [lastAdded, setLastAdded] = useState<string>();
  const [revoking, setRevoking] = useState<string>();
  const [typed, setTyped] = useState('');

  const add = async () => {
    if (!senderIdValid(newId)) return;
    // The token comes back in the answer and is kept only in `shown`; nothing else in the panel stores it.
    const r = await change('POST', '/senders', { id: newId, cadence: newCadence });
    if (r.ok) {
      const d = r.data as { token: string; configLine: string };
      setShown({ id: newId, token: d.token, configLine: d.configLine });
      setLastAdded(newId);
      setNewId('');
      setAdding(false);
    }
  };

  const loopback = shown !== undefined && isLoopbackUrl(connectUrl(shown.configLine) ?? '');

  const closeShown = () => {
    setShown(undefined);
  };

  const revoke = async (id: string) => {
    if (!revokeEnabled(typed, id)) return;
    await change('POST', `/senders/${encodeURIComponent(id)}/revoke`, { confirm: typed });
    setRevoking(undefined);
    setTyped('');
  };

  return (
    <section className="admin-section" aria-label="Senders">
      <h3>Senders</h3>
      {senders.length === 0 && <p className="hub-empty">No senders yet.</p>}
      {senders.map((s) => {
        const st = senderState(s);
        return (
          <div className="admin-row" key={s.id}>
            <div className="admin-line">
              <span className="hub-sender" title={s.id}>{s.id}</span>
              <span className={`chip admin-state ${st}`}>{st}</span>
              <span className="hub-right" title={new Date(s.createdAt).toLocaleString()}>{new Date(s.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="admin-line">
              {/* PUT /cadence replaces the whole map, so the change carries every sender's cadence, not just this one. */}
              <select className="admin-select" aria-label={`Cadence for ${s.id}`} value={cadenceOf(s)} disabled={st === 'revoked'}
                onChange={(e) => void change('PUT', '/cadence', { cadence: { ...cadence, [s.id]: e.target.value } })}>
                {CADENCE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {st !== 'revoked' && (
                <button className="btn" onClick={() => void change('POST', `/senders/${encodeURIComponent(s.id)}/${s.paused ? 'resume' : 'pause'}`)}>
                  {s.paused ? 'Resume' : 'Pause'}
                </button>
              )}
              {st !== 'revoked' && (
                <button className="btn" onClick={() => { setRevoking(s.id); setTyped(''); }}>Revoke</button>
              )}
            </div>
            {revoking === s.id && (
              <div className="admin-line">
                <span>Confirm revoke</span>
                {/* The placeholder names the text to type: a bare id would read as a value already entered. */}
                <input className="admin-input" aria-label={`Type ${s.id} to revoke`} placeholder={`type "${s.id}" to confirm`} value={typed}
                  onChange={(e) => setTyped(e.target.value)} />
                <button className="btn" disabled={!revokeEnabled(typed, s.id)} onClick={() => void revoke(s.id)}>Revoke</button>
                <button className="btn" onClick={() => setRevoking(undefined)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}
      {/* After the box closes, the only trace of a new token is its prefix: the full value is never kept. */}
      {lastAdded && !shown && <p className="hub-empty mono">{shortToken(lastAdded)}</p>}
      {shown && (
        <div className="admin-box">
          <p className="hub-warn">Shown once: copy it now</p>
          <code className="admin-token">{shown.token}</code>
          <code className="admin-token">{shown.configLine}</code>
          {/* A loopback URL works only on this machine; the note says what to put in its place. */}
          {loopback && <p className="hub-empty admin-note">Replace 127.0.0.1 with the address other machines use for this hub (its tailnet name)</p>}
          <div className="admin-line">
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(shown.configLine)}>Copy</button>
            <button className="btn" onClick={closeShown}>Close</button>
          </div>
        </div>
      )}
      {adding ? (
        <div className="admin-line">
          <input className="admin-input" aria-label="New sender id" placeholder="id" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <select className="admin-select" aria-label="New sender cadence" value={newCadence} onChange={(e) => setNewCadence(e.target.value as Cadence)}>
            {CADENCE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn" disabled={!senderIdValid(newId)} onClick={() => void add()}>Add</button>
          <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setAdding(true)}>+ Add sender</button>
      )}
    </section>
  );
}

/** Viewers: each login with a remove button, and one field to add a login. */
function ViewersSection({ viewers, change }: { viewers: string[]; change: Change }) {
  const [draft, setDraft] = useState('');
  return (
    <section className="admin-section" aria-label="Viewers">
      <h3>Viewers</h3>
      {viewers.map((v) => (
        <div className="admin-line" key={v}>
          <span className="hub-cell" title={v}>{v}</span>
          <button className="btn" aria-label={`Remove ${v}`} onClick={() => void change('PUT', '/viewers', { viewers: removeViewer(viewers, v) })}>×</button>
        </div>
      ))}
      <div className="admin-line">
        <input className="admin-input" aria-label="New viewer" placeholder="login" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn" disabled={draft.trim() === ''}
          onClick={() => { void change('PUT', '/viewers', { viewers: addViewer(viewers, draft) }); setDraft(''); }}>Add</button>
      </div>
    </section>
  );
}

/** Budgets: a global limit and one row per project, in USD a month. Edits stay local until Save. */
function BudgetsSection({ budgets, change }: { budgets: AdminView['budgets']; change: Change }) {
  const [global, setGlobal] = useState(budgets.global === undefined ? '' : String(budgets.global));
  const [rows, setRows] = useState<BudgetRow[]>(() =>
    Object.entries(budgets.projects ?? {}).map(([name, v]) => ({ name, value: String(v) })));
  const [newName, setNewName] = useState('');
  const [bad, setBad] = useState(false);

  const save = async () => {
    const body = budgetBody(global, rows);
    setBad(body === undefined);
    if (body) await change('PUT', '/budgets', body);
  };

  return (
    <section className="admin-section" aria-label="Budgets">
      <h3>Budgets (USD / month)</h3>
      <div className="admin-line">
        <span>Global</span>
        <input className="admin-input" aria-label="Global budget" inputMode="decimal" value={global} onChange={(e) => setGlobal(e.target.value)} />
      </div>
      {rows.map((r, i) => (
        <div className="admin-line" key={r.name}>
          <span className="hub-cell" title={r.name}>{r.name}</span>
          <input className="admin-input" aria-label={`Budget for ${r.name}`} inputMode="decimal" value={r.value}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <button className="btn" aria-label={`Remove ${r.name}`} onClick={() => setRows(removeBudgetRow(rows, i))}>×</button>
        </div>
      ))}
      <div className="admin-line">
        <input className="admin-input" aria-label="New project" placeholder="project" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn" disabled={newName.trim() === ''} onClick={() => { setRows(addBudgetRow(rows, newName)); setNewName(''); }}>+ Project</button>
        <button className="btn" onClick={() => void save()}>Save</button>
      </div>
      {bad && <p className="hub-warn">Budgets must be amounts of 0 or more</p>}
    </section>
  );
}

/** Alerts: one switch per rule, labelled as on the Alerts tab. */
function AlertsSection({ alerts, change }: { alerts: Record<string, boolean>; change: Change }) {
  return (
    <section className="admin-section" aria-label="Alert rules">
      <h3>Alerts</h3>
      {RULES.map((rule) => (
        <label className="admin-line" key={rule}>
          <input type="checkbox" checked={ruleOn(alerts, rule)} onChange={(e) => void change('PUT', '/alerts', { rule: { [rule]: e.target.checked } })} />
          <span>{RULE_LABEL[rule] ?? rule}</span>
        </label>
      ))}
    </section>
  );
}

/**
 * Retention: raw days, then a delete of everything before a date. The delete is two clicks: the first
 * shows the count from history/count, the second (labelled with that count) performs it.
 */
function RetentionSection({ days, change }: { days: number; change: Change }) {
  const [draft, setDraft] = useState(String(days));
  const [day, setDay] = useState('');
  const [count, setCount] = useState<number>();
  const [armed, setArmed] = useState(false);
  const [bad, setBad] = useState(false);

  const n = Number(draft);
  const ms = dayToMs(day);

  // A new date means a new preview: the armed delete belongs to the old count, so it is dropped.
  const pickDay = async (value: string) => {
    setDay(value);
    setArmed(false);
    setCount(undefined);
    const at = dayToMs(value);
    if (at === undefined) return;
    const r = await callAdmin<{ events: number }>('GET', `/history/count?before=${at}`);
    if (r.ok) setCount(r.data.events);
  };

  const remove = async () => {
    if (ms === undefined) return;
    if (!armed) return setArmed(true);
    await change('POST', '/history/delete-before', { before: ms, confirm: true });
    setArmed(false);
    setCount(undefined);
  };

  return (
    <section className="admin-section" aria-label="Retention">
      <h3>Retention</h3>
      <div className="admin-line">
        <span>Raw days</span>
        <input className="admin-input" type="number" min={1} max={21} aria-label="Raw days" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn" onClick={() => { setBad(!retentionValid(n)); if (retentionValid(n)) void change('PUT', '/retention', { retentionDays: n }); }}>Save</button>
      </div>
      {bad && <p className="hub-warn">Raw days must be a whole number from 1 to 21</p>}
      <div className="admin-line">
        <span>Delete events before</span>
        <input className="admin-input" type="date" aria-label="Delete events before" value={day} onChange={(e) => void pickDay(e.target.value)} />
      </div>
      {ms !== undefined && count !== undefined && (
        <div className="admin-line">
          <span className="hub-empty">{count} events would go</span>
          <button className="btn" disabled={count === 0} onClick={() => void remove()}>
            {armed ? confirmDeleteLabel(count) : 'Delete'}
          </button>
        </div>
      )}
    </section>
  );
}

/** Audit: the last 50 changes, newest first. Action and target only; the log never holds a token. */
function AuditSection({ audit }: { audit: AdminView['audit'] }) {
  const rows = auditRows(audit);
  return (
    <section className="admin-section" aria-label="Audit log">
      <h3>Audit log</h3>
      {rows.length === 0 && <p className="hub-empty">No changes yet.</p>}
      {rows.map((r, i) => (
        <div className="admin-line admin-audit" key={`${r.time}-${i}`}>
          <span className="mono dim">{r.time}</span>
          <span>{r.action}</span>
          <span className="hub-cell" title={r.target}>{r.target}</span>
        </div>
      ))}
    </section>
  );
}
