import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { create } from 'zustand';
import { splitTarget } from '../../core/events';
import type { Workspace } from '../../core/types';
import { ago, alertsPill, hubPill, machineState, nowRows, showUser, workingCount, type AlertsView, type NowRow, type NowState, type ResolveTarget } from '../hub';
import { towerPath } from '../graph';
import { useLive } from '../live';
import { findNode, useStore } from '../store';
import { STATIC } from '../staticData';
import { AlertsTab, readAlerts } from './HubAlerts';
import { HubAdmin } from './HubAdmin';
import { adminVisible } from './hubAdminModel';

type Tab = 'now' | 'machines' | 'alerts' | 'admin';

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
  /** GET /api/hub/alerts, polled by the top-bar pill in hub mode: `undefined` means not loaded or lost. */
  alerts?: AlertsView;
  setAlerts(alerts: AlertsView | undefined): void;
}

const TABS: Tab[] = ['now', 'machines', 'alerts', 'admin'];

/**
 * The tabs this page may show: Admin only for a hub that is not a remote viewer (#93). Step and the tab
 * bar both read this, so [ ] never lands on a tab the bar does not draw.
 */
export const visibleTabs = (me?: HubMe): Tab[] => (adminVisible(me) ? TABS : TABS.filter((t) => t !== 'admin'));

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
  step: (d) => {
    const tabs = visibleTabs(get().me);
    const i = tabs.indexOf(get().tab);
    // A tab that just got hidden (me changed to a viewer) is not in the list: start from the first tab.
    set({ tab: tabs[(i < 0 ? 0 : i + d + tabs.length) % tabs.length] });
  },
  setMe: (me) => set({ me }),
  alerts: undefined,
  setAlerts: (alerts) => set({ alerts }),
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
  const alerts = useHub((s) => s.alerts);
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

  const ws = useStore((s) => s.workspace);
  // Targets are "towerId#node": with a workspace loaded they read as the tower name and node label.
  const resolve = useMemo(() => resolveIn(ws), [ws]);
  const rows = useMemo(() => nowRows(events, now, resolve), [events, now, resolve]);

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
        {visibleTabs(me).map((id) => (
          <button key={id} id={`hub-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="hub-panel"
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'on' : ''} onClick={() => show(id)}>
            {id.toUpperCase()}
          </button>
        ))}
      </nav>
      <div className="tabbody" id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`}>
        {/* Admin controls (#93) must render here only when !me.readOnly: hidden for a viewer, never greyed out. */}
        {tab === 'now' && <NowTab rows={rows} now={now} ws={ws} />}
        {tab === 'machines' && <MachinesTab rows={machines} now={now} failed={failed} />}
        {tab === 'alerts' && <AlertsTab view={alerts} canAct={!!me && !me.readOnly} onChanged={() => void readAlerts(useHub.getState().setAlerts)} />}
        {tab === 'admin' && adminVisible(me) && <HubAdmin />}
      </div>
      <footer className="hub-foot">Metadata only: no prompt text ever leaves a machine.</footer>
    </aside>
  );
}

/**
 * Who is doing what right now. Six columns never fit the right panel (the live-hub test saw `run · 33…`
 * and seven-character machines), so a row reads on two lines like MachinesTab: identity first, dim
 * metadata second. No header row: each value carries a `title`, which a cut column header never could.
 */
function NowTab({ rows, now, ws }: { rows: NowRow[]; now: number; ws?: Workspace }) {
  if (!rows.length) return <p className="hub-empty">No live activity yet.</p>;
  return (
    <div className="hub-rows">
      {rows.map((r) => (
        <div className="hub-row" key={r.key}>
          {/* The row opens the tower and node the latest event landed on; the error line opens its own node. */}
          <button className="hub-main hub-jump" disabled={!r.target} onClick={() => jumpToTarget(ws, r.target)}
            title={r.target ? `Open ${r.tower}${r.node ? ` › ${r.node}` : ''}` : 'No node matched this activity'}>
            <span className={`hub-dot ${r.state}`} title={r.state}>{DOT[r.state]}</span>
            {/* Every cell is ellipsized by CSS, so its title carries the value the cut hides. */}
            <span className="hub-sender" title={r.machine}>{r.machine}</span>
            <span className="hub-cell hub-where" title={`${r.tower}${r.node ? ` › ${r.node}` : ''}`}>
              {r.tower}{r.node && <><span className="hub-sep" aria-hidden="true"> › </span>{r.node}</>}
            </span>
            <span className="hub-right" title={`${r.state} · ${ago(now - r.last)}`}>{r.state} · {ago(now - r.last)}</span>
          </button>
          <div className="hub-meta">
            {/* The user moves to line 2 and only when it adds news: the machine name already says who it is. */}
            {showUser(r) && <span className="hub-cell" title={r.startedBy}>{r.startedBy}</span>}
            {!showUser(r) && r.startedBy === 'AUTO' && <span className="chip hub-auto" title="Started automatically">AUTO</span>}
            {(showUser(r) || r.startedBy === 'AUTO') && <span className="hub-sep" aria-hidden="true">·</span>}
            <span className="hub-cell" title={r.runtime}>{r.runtime}</span>
            <span className="hub-sep" aria-hidden="true">·</span>
            <span className="hub-cell" title={`${r.count} events`}>{r.count} {r.count === 1 ? 'event' : 'events'}</span>
          </div>
          {r.lastError && (
            // The error no longer carries its target, so this line only names the failure; the Live feed has the details.
            <div className="hub-error"
              title={`Last error on ${r.lastError.node ?? r.tower} (${r.lastError.tool ?? 'unknown tool'}) — open the Live feed for details`}>
              ✕ error · <span className="hub-cell">{r.lastError.node ?? r.lastError.tool ?? '–'}</span> · {ago(now - r.lastError.ts)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Labels for a "towerId#node" target from the loaded library: the tower's name and the node's label. With no
 * workspace yet, the ids stand in, so the rows still show something.
 */
export function resolveIn(ws?: Workspace): ResolveTarget {
  return (target) => {
    const [towerId, key] = splitTarget(target);
    const tower = ws?.towers[towerId];
    const node = tower && findNode(tower, key);
    return { tower: tower?.name ?? towerId, node: node?.label ?? key };
  };
}

/**
 * Open the tower a target names on its node. Same mechanism as the Live feed's jump: the tower on screen gets
 * a select (and a layer focus), any other tower is opened by its path. The library overlay may hide the
 * panel, so it is closed first by the caller's action (the Hub panel is the one the user just clicked).
 */
function jumpToTarget(ws: Workspace | undefined, target: string | undefined) {
  if (!target || !ws) return;
  const [towerId, key] = splitTarget(target);
  // A tower can vanish from the library after an unshare: do nothing, the same as resolveIn's fallback.
  const tower = ws.towers[towerId];
  if (!tower) return;
  const s = useStore.getState();
  const node = findNode(tower, key);
  if (!node) return;
  const current = s.stack[s.stack.length - 1];
  if (towerId === current) {
    s.select(key);
    if (s.focusedLayer !== undefined) s.focusLayer(tower.layers.findIndex((l) => l.id === node.layer));
    return;
  }
  const path = towerPath(ws, towerId);
  if (path) s.openPath(path, key);
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

  // A browser notice click opens the Alerts tab (HubAlerts.tsx dispatches this event; no import cycle).
  useEffect(() => {
    const open = (e: Event) => useHub.getState().show((e as CustomEvent<Tab>).detail);
    window.addEventListener('flow-tower:hub-open', open);
    return () => window.removeEventListener('flow-tower:hub-open', open);
  }, []);

  // Alerts are a hub read too: poll them on the machines cadence, and only once this page is a hub.
  const onHub = !!me?.hub;
  useEffect(() => {
    if (STATIC || !onHub) return;
    const ac = new AbortController();
    const read = () => void readAlerts(useHub.getState().setAlerts, ac.signal);
    read();
    const t = setInterval(read, MACHINES_MS);
    return () => { ac.abort(); clearInterval(t); };
  }, [onHub]);

  const pill = hubPill(me);
  if (!pill) return null;
  return (
    <>
      <button className="chip clickable hub-chip" onClick={() => show('machines')}
        title="Senders seen in the last 5 min / active tokens (H)">{pill}</button>
      <AlertsPill />
      {me?.readOnly && (
        <span className="chip warn hub-ro" title="Remote viewer: nothing here can change the hub">READ-ONLY</span>
      )}
    </>
  );
}

/** The Now clock for the library chip: ages and run states change without new events, so it ticks too. */
const WORKING_MS = 5000;

/**
 * "● 2 working" in the library header: how many Now rows are running right now. Only on a hub, and hidden
 * at zero so a quiet library stays quiet. Clicking it opens Hub › Now; the library overlay covers the panel,
 * so it is closed first (the same reason AlertsPill takes an onOpen).
 */
export function WorkingChip({ onOpen }: { onOpen: () => void }) {
  const hub = useHub((s) => !!s.me?.hub);
  const events = useLive((s) => s.events);
  const ws = useStore((s) => s.workspace);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hub) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), WORKING_MS);
    return () => clearInterval(t);
  }, [hub]);
  const resolve = useMemo(() => resolveIn(ws), [ws]);
  const working = useMemo(() => workingCount(nowRows(events, now, resolve)), [events, now, resolve]);
  if (!hub || !working) return null;
  return (
    <button className="chip clickable working-chip" onClick={onOpen} title="Working right now (H › Now)">
      ● {working} working
    </button>
  );
}

/**
 * The unacked-alerts pill, shared by the top bar and the library header (the library hides the top bar,
 * so the pill must be there too). Renders nothing when no alert is open. Its pulse only moves the glow
 * (box-shadow), never the size or a transform, so Playwright sees the button as stable and clickable.
 */
export function AlertsPill({ onOpen }: { onOpen?: () => void } = {}) {
  const firing = alertsPill(useHub((s) => s.alerts));
  const show = useHub((s) => s.show);
  if (!firing) return null;
  return (
    // The library overlay covers the Hub panel, so its pill passes onOpen to close the library first.
    <button className={`chip clickable alerts-pill ${firing.level}`} data-alerts={firing.count}
      onClick={onOpen ?? (() => show('alerts'))} title={`${firing.count} unacked alert${firing.count === 1 ? '' : 's'} (H › Alerts)`}>
      ⚠ {firing.count}
    </button>
  );
}
