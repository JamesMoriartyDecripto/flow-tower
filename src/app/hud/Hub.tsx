import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { ago, machineState, nowRows, type NowRow, type NowState } from '../hub';
import { useLive } from '../live';
import { STATIC } from '../staticData';

type Tab = 'now' | 'machines';

/**
 * The Hub panel takes the Inspector's place, so the keyboard handler in App.tsx and the panel itself
 * share the open flag and the tab through this store instead of prop drilling. Immutable like the rest
 * of the app: every action sets a new state, never a mutation.
 */
interface HubStore {
  open: boolean;
  tab: Tab;
  toggle(): void;
  close(): void;
  /** Open the panel on one tab (the tab buttons call it while it is already open). */
  show(tab: Tab): void;
  /** Move to the other tab, wrapping: [ ] while it is open, ← → while it has the focus. */
  step(d: 1 | -1): void;
}

const TABS: Tab[] = ['now', 'machines'];

export const useHub = create<HubStore>()((set, get) => ({
  open: false,
  tab: 'now',
  toggle: () => set({ open: !get().open }),
  close: () => set({ open: false }),
  show: (tab) => set({ open: true, tab }),
  step: (d) => set({ tab: TABS[(TABS.indexOf(get().tab) + d + TABS.length) % TABS.length] }),
}));

/** The Now clock: ages and states are relative, so they must be recomputed while the panel is open. */
const NOW_MS = 5000;
/** The Machines list comes from the hub's own read route; five-minute staleness is all it reports. */
const MACHINES_MS = 10_000;

/** One dot per Now state, so the row reads at a glance like the live scene. */
const DOT: Record<NowState, string> = { run: '●', idle: '◐', silent: '○' };

/**
 * One row of GET /api/hub/machines (src/server/machines.ts). Metadata only: a sender id, a shortened
 * token label and counters — never a token plaintext.
 */
interface Machine {
  sender: string;
  token: string;
  runtime?: string;
  host?: string;
  lastSeen?: number;
  queued?: number;
  state: string;
  online: boolean;
}

/** Right-hand panel with what the hub sees: the live Now rows and the senders it trusts. */
export function HubPanel() {
  const open = useHub((s) => s.open);
  const tab = useHub((s) => s.tab);
  const show = useHub((s) => s.show);
  const close = useHub((s) => s.close);
  const step = useHub((s) => s.step);
  const events = useLive((s) => s.events);
  const [now, setNow] = useState(() => Date.now());
  const [machines, setMachines] = useState<Machine[]>([]);
  const [failed, setFailed] = useState(false);

  // One clock while the panel is open: the rows age in place, and closing the panel clears it.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), NOW_MS);
    return () => clearInterval(t);
  }, [open]);

  // [ and ] cycle the tabs, whether the focus is in the panel or on the scene.
  useEffect(() => {
    if (!open) return;
    const onTab = (e: Event) => step((e as CustomEvent<number>).detail === 1 ? 1 : -1);
    window.addEventListener('flow-tower:tab', onTab);
    return () => window.removeEventListener('flow-tower:tab', onTab);
  }, [open, step]);

  // The Machines tab is a read of the hub: poll it while it is shown and abort on close or tab change.
  useEffect(() => {
    if (!open || tab !== 'machines') return;
    const ac = new AbortController();
    const read = async () => {
      try {
        const res = await fetch('/api/hub/machines', { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        setMachines((await res.json()) as Machine[]);
        setFailed(false);
      } catch {
        // Our own abort is a cleanup, not a hub that went away: only a real failure is shown.
        if (!ac.signal.aborted) setFailed(true);
      }
    };
    void read();
    const t = setInterval(() => void read(), MACHINES_MS);
    return () => { ac.abort(); clearInterval(t); };
  }, [open, tab]);

  const rows = useMemo(() => nowRows(events, now), [events, now]);
  // The static demo has no server: no hub to read, so the panel stays away like the mic (Voice.tsx).
  if (!open || STATIC) return null;

  return (
    <aside className="panel inspector hub" aria-label="Hub">
      <header>
        <button className="close" onClick={close} title="Close (Esc)">✕</button>
        <div className="chips"><span className="chip">HUB</span></div>
        <h2>Hub</h2>
        <div className="mono dim hub-hint">[ ] tab · Esc close</div>
      </header>
      <nav className="tabs" role="tablist" aria-label="Hub views">
        {TABS.map((id) => (
          <button key={id} id={`hub-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="hub-panel"
            className={tab === id ? 'on' : ''} onClick={() => show(id)}>
            {id.toUpperCase()}
          </button>
        ))}
      </nav>
      <div className="tabbody" id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`}>
        {tab === 'now' ? <NowTab rows={rows} now={now} /> : <MachinesTab rows={machines} now={now} failed={failed} />}
      </div>
      <footer className="hub-foot">Metadata only: no prompt text ever leaves a machine.</footer>
    </aside>
  );
}

/** Who is doing what right now: one line per machine, runtime, project and starter. */
function NowTab({ rows, now }: { rows: NowRow[]; now: number }) {
  if (!rows.length) return <p className="hub-empty">No live activity yet.</p>;
  return (
    <div className="hub-rows">
      <div className="hub-row head" aria-hidden="true">
        <span /><span>MACHINE</span><span>RUNTIME</span><span>PROJECT</span><span>BY</span><span>STATE</span>
      </div>
      {rows.map((r) => (
        <div className="hub-row" key={`${r.machine}\n${r.runtime}\n${r.project}\n${r.startedBy}`}>
          <span className={`hub-dot ${r.state}`} title={r.state}>{DOT[r.state]}</span>
          <span className="hub-cell">{r.machine}</span>
          <span className="hub-cell">{r.runtime}</span>
          <span className="hub-cell">{r.project}</span>
          <span className="hub-cell">{r.startedBy === 'AUTO' ? <span className="chip hub-auto">AUTO</span> : r.startedBy}</span>
          <span className="hub-cell hub-state">{r.state} · {ago(now - r.last)}</span>
        </div>
      ))}
    </div>
  );
}

/** Every sender the hub knows: its token row, when it was last heard from and what it queued. */
function MachinesTab({ rows, now, failed }: { rows: Machine[]; now: number; failed: boolean }) {
  if (!rows.length) {
    return <p className="hub-empty">{failed ? 'Machines unavailable' : 'No senders yet. Add one with flow-tower token add <name>.'}</p>;
  }
  return (
    <>
      {failed && <p className="hub-warn">Machines unavailable</p>}
      <div className="hub-rows machines">
        <div className="hub-row head" aria-hidden="true">
          <span>SENDER</span><span>TOKEN</span><span>STATE</span><span>RUNTIME</span><span>HOST</span><span>SEEN</span><span>QUEUED</span>
        </div>
        {rows.map((m) => {
          const st = machineState(m);
          return (
            <div className="hub-row" key={m.sender}>
              <span className="hub-cell">{m.sender}</span>
              <span className="hub-cell hub-token">{m.token || '–'}</span>
              <span className="hub-cell hub-live"><span className={`hub-dot ${st.label}`} title={st.label}>{st.dot}</span>{st.label}</span>
              <span className="hub-cell">{m.runtime ?? '–'}</span>
              <span className="hub-cell">{m.host ?? '–'}</span>
              <span className="hub-cell">{m.lastSeen === undefined ? '–' : ago(now - m.lastSeen)}</span>
              <span className="hub-cell">{m.queued ?? 0}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}