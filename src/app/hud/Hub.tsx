import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { create } from 'zustand';
import { ago, hubPill, machineState, nowRows, type NowRow, type NowState } from '../hub';
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
  /** GET /api/hub/me, polled once by the top-bar chip and read here: `undefined` means unknown/lost. */
  me?: HubMe;
  toggle(): void;
  close(): void;
  /** Open the panel on one tab (the tab buttons call it while it is already open). */
  show(tab: Tab): void;
  /** Move to the other tab, wrapping: [ ] while it is open, ← → while it has the focus. */
  step(d: 1 | -1): void;
  setMe(me: HubMe | undefined): void;
}

const TABS: Tab[] = ['now', 'machines'];

/**
 * One /api/hub/me answer (src/server/hub-views.ts): whether this page is on a hub, whether it is a
 * remote viewer, and the two counters of the top-bar pill. Metadata only: counts and flags, no token.
 */
export interface HubMe {
  hub: boolean;
  readOnly: boolean;
  online: number;
  tokens: number;
}

export const useHub = create<HubStore>()((set, get) => ({
  open: false,
  tab: 'now',
  me: undefined,
  toggle: () => set({ open: !get().open }),
  close: () => set({ open: false }),
  show: (tab) => set({ open: true, tab }),
  step: (d) => set({ tab: TABS[(TABS.indexOf(get().tab) + d + TABS.length) % TABS.length] }),
  setMe: (me) => set({ me }),
}));

/** The Now clock: ages and states are relative, so they must be recomputed while the panel is open. */
const NOW_MS = 5000;
/** The Machines list comes from the hub's own read route; five-minute staleness is all it reports. */
const MACHINES_MS = 10_000;
/** /api/hub/me feeds the top-bar pill: online count and active tokens, refreshed every half minute. */
const ME_MS = 30_000;

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
  const me = useHub((s) => s.me);
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

  /**
   * WAI-ARIA tabs pattern on the tablist: ← → move the selection and the focus together. We handle it
   * here (and stop the event) because App.tsx listens on window and would otherwise also pan the scene.
   */
  const tabKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    e.stopPropagation();
    step(e.key === 'ArrowRight' ? 1 : -1);
    // The store is synchronous, so the id already points at the tab we just selected.
    document.getElementById(`hub-tab-${useHub.getState().tab}`)?.focus();
  };

  // The static demo has no server: no hub to read, so the panel stays away like the mic (Voice.tsx).
  if (!open || STATIC) return null;

  return (
    <aside className="panel inspector hub" aria-label="Hub">
      <header>
        <button className="close" onClick={close} title="Close (Esc)">✕</button>
        <div className="chips">
          <span className="chip">HUB</span>
          {me?.readOnly && <span className="chip warn" title="Remote viewer: nothing here can change the hub">READ-ONLY</span>}
        </div>
        <h2>Hub</h2>
        <div className="mono dim hub-hint">[ ] tab · Esc close</div>
      </header>
      <nav className="tabs" role="tablist" aria-label="Hub views" onKeyDown={tabKey}>
        {TABS.map((id) => (
          <button key={id} id={`hub-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="hub-panel"
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'on' : ''} onClick={() => show(id)}>
            {id.toUpperCase()}
          </button>
        ))}
      </nav>
      <div className="tabbody" id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`}>
        {/* Admin controls (#93) must render here only when !me.readOnly: hidden for a viewer, never greyed out. */}
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
          {/* Every cell is ellipsized by CSS, so its title carries the value the cut hides. */}
          <span className="hub-cell" title={r.machine}>{r.machine}</span>
          <span className="hub-cell" title={r.runtime}>{r.runtime}</span>
          <span className="hub-cell" title={r.project}>{r.project}</span>
          <span className="hub-cell" title={r.startedBy === 'AUTO' ? 'Started automatically' : r.startedBy}>
            {r.startedBy === 'AUTO' ? <span className="chip hub-auto">AUTO</span> : r.startedBy}
          </span>
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
        {rows.map((m) => {
          const st = machineState(m);
          // Only the parts the hub actually knows: a missing runtime or host is left out, not shown as a dash.
          const parts = [
            m.token && { key: 'token', text: m.token, title: m.token },
            m.runtime && { key: 'runtime', text: m.runtime, title: m.runtime },
            m.host && { key: 'host', text: m.host, title: m.host },
            m.queued !== undefined && { key: 'queued', text: `queued ${m.queued}`, title: `queued ${m.queued}` },
          ].filter((p): p is { key: string; text: string; title: string } => !!p);
          return (
            <div className="hub-row" key={m.sender}>
              <div className="hub-main">
                <span className={`hub-dot ${st.label}`} title={st.label}>{st.dot}</span>
                {/* Each cell ellipsizes on its own line, so its title carries the full value. */}
                <span className="hub-sender" title={m.sender}>{m.sender}</span>
                <span className="hub-live">{st.label}</span>
                <span className="hub-seen">{m.lastSeen === undefined ? 'never' : `seen ${ago(now - m.lastSeen)}`}</span>
              </div>
              <div className="hub-meta">
                {parts.map((p, i) => (
                  <Fragment key={p.key}>
                    {i > 0 && <span className="hub-sep" aria-hidden="true">·</span>}
                    <span className="hub-cell" title={p.title}>{p.text}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Top-bar pill (Chrome.tsx places it beside the SAT chip): the only poller of /api/hub/me, so the panel
 * and the pill share one `me` through the store. Hidden on a non-hub or in the static demo, and left off
 * while the fetch fails, so a plain checkout never shows a stale count.
 */
export function HubChip() {
  const me = useHub((s) => s.me);
  const show = useHub((s) => s.show);

  useEffect(() => {
    if (STATIC) return;
    const ac = new AbortController();
    const read = async () => {
      try {
        const res = await fetch('/api/hub/me', { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        useHub.getState().setMe((await res.json()) as HubMe);
      } catch {
        // A lost hub is not the same as our own abort: only a real failure clears the pill.
        // Hiding the pill is safe: READ-ONLY is a hint for the viewer, and the server refuses every
        // write from a remote viewer anyway (hubGuard), so a hidden pill never grants anything.
        if (!ac.signal.aborted) useHub.getState().setMe(undefined);
      }
    };
    void read();
    const t = setInterval(() => void read(), ME_MS);
    return () => { ac.abort(); clearInterval(t); };
  }, []);

  const pill = hubPill(me);
  if (!pill) return null;
  return (
    <>
      <button className="chip clickable hub-chip" onClick={() => show('machines')}
        title="Senders seen in the last 5 min / active tokens (H)">{pill}</button>
      {me?.readOnly && (
        <span className="chip warn hub-ro" title="Remote viewer: nothing here can change the hub">READ-ONLY</span>
      )}
    </>
  );
}
