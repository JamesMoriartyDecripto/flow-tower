import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { STATIC } from '../staticData';
import { agoText, darkProjects, queueText, satClass, satText, satTitle, shareStatus, SHARING_OFF, type SharingState, type TowerShare } from '../sharing';
import { usePrefs } from '../settings';
import { RECENT_HOSTS_MS, sourceOf } from '../library';
import { useLive, descendants } from '../live';
import { useStore } from '../store';
import { Row, Toggle } from './Settings';
import './shareControl.css';

const POLL_MS = 5000;

/** A local project that is active here but whose events the hub does not light (#266). */
interface DarkProject { id: string; name: string }

async function getSharing(): Promise<SharingState> {
  const res = await fetch('/api/sharing');
  if (!res.ok) return SHARING_OFF;
  return (await res.json()) as SharingState;
}

/** The recorded shares (GET /api/sharing/towers). Only asked for a satellite: a local server has none. */
async function getShares(): Promise<TowerShare[]> {
  const res = await fetch('/api/sharing/towers');
  if (!res.ok) return [];
  return ((await res.json()) as { shares: TowerShare[] }).shares;
}

/** One shared store: the chip polls it, the Settings section reads it and updates it after each action. */
const useSharing = create<{
  sharing: SharingState;
  shares: TowerShare[];
  dark: DarkProject[];
  set(sharing: SharingState): void;
  setShares(shares: TowerShare[]): void;
  setDark(dark: DarkProject[]): void;
}>()((set) => ({
  sharing: SHARING_OFF,
  shares: [],
  dark: [],
  set: (sharing) => set({ sharing }),
  setShares: (shares) => set({ shares }),
  setDark: (dark) => set({ dark }),
}));

/**
 * The local projects with activity in the last window that no share of this machine lists (#266). Computed on
 * each poll tick; only a changed list is stored, so a quiet tick does not re-render the chip or the section.
 */
function computeDark(shares: TowerShare[]): DarkProject[] {
  const ws = useStore.getState().workspace;
  if (!ws) return [];
  const desc = descendants(ws);
  const local = ws.projects
    .filter((id) => sourceOf(ws, id) === 'local')
    .map((id) => ({ id, towers: new Set([id, ...(desc.get(id) ?? [])]) }));
  const ids = darkProjects(useLive.getState().nodes, local, shares, Date.now(), RECENT_HOSTS_MS);
  return ids.map((id) => ({ id, name: ws.towers[id]?.name ?? id }));
}

function setDarkIfChanged(next: DarkProject[]) {
  const prev = useSharing.getState().dark;
  const same = prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.name === next[i].name);
  if (!same) useSharing.getState().setDark(next);
}

/** The shares of this machine, for the library cards and the Settings list. */
export function useShares(): TowerShare[] {
  return useSharing((s) => s.shares);
}

/** True when this server is a satellite (its relay state is not 'off'): only then can it share with a hub. */
export function useSatellite(): boolean {
  return useSharing((s) => s.sharing.state !== 'off');
}

/** Fetch the state once and put it in the store (also after a pause or a test, to show the result). */
export function refreshSharing(): Promise<void> {
  return getSharing().then(async (s) => {
    useSharing.getState().set(s);
    // The shares are read only when there is a relay: a server that is not a satellite has nothing to list.
    const shares = s.state === 'off' ? [] : await getShares();
    useSharing.getState().setShares(shares);
    // A server that is not a satellite has no hub to be dark on, so the list stays empty there.
    setDarkIfChanged(s.state === 'off' ? [] : computeDark(shares));
  }).catch(() => {});
}

/** What a failed share or unshare reports: the text, and whether the hub could not be reached at all. */
export interface ActionFailure { error: string; unreachable?: boolean }

/** The route's error text and its unreachable flag, or a fallback when the answer carries none. */
async function failure(res: Response): Promise<ActionFailure> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; unreachable?: boolean };
  return { error: body.error ?? `request failed (${res.status})`, unreachable: body.unreachable === true };
}

/**
 * POST one action to the route. A rejected fetch (the local server is down, the connection dropped) becomes the
 * failure text instead of a throw, so the caller always gets an answer to show and can clear its busy state.
 */
async function postTower(body: object): Promise<ActionFailure | undefined> {
  let res: Response;
  try {
    res = await fetch('/api/sharing/towers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) {
    await refreshSharing();
    return { error: err instanceof Error ? err.message : String(err) };
  }
  await refreshSharing();
  return res.ok ? undefined : failure(res);
}

/** Share a library project with the hub; resolves to undefined on success, or the failure. */
export function shareProject(project: string, files: boolean): Promise<ActionFailure | undefined> {
  return postTower({ project, files });
}

/** Stop sharing a folder by its share name. `force` drops it from this config even when the hub cannot be told. */
export function unshareTower(name: string, force = false): Promise<ActionFailure | undefined> {
  return postTower({ unshare: name, force });
}

/** Poll every 5 s. The chip is always mounted, so the store stays fresh while Settings is closed too. */
function useSharingPoll() {
  useEffect(() => {
    if (STATIC) return;
    // A hidden tab asks for nothing: skip the tick there and refresh once when it becomes visible again.
    const poll = () => { if (document.visibilityState !== 'hidden') void refreshSharing(); };
    poll();
    const t = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', poll);
    };
  }, []);
}

/** Open Settings and scroll to the Sharing section (the dialog focuses its first control after 50 ms). */
function openSharingSettings() {
  usePrefs.getState().set({ open: true });
  setTimeout(() => document.getElementById('settings-sharing')?.scrollIntoView({ block: 'start' }), 50);
}

/** Top-bar chip: hidden when this server is not a satellite; click opens the sharing settings. */
export function SatChip() {
  useSharingPoll();
  const sharing = useSharing((s) => s.sharing);
  const dark = useSharing((s) => s.dark);
  if (sharing.state === 'off') return null;
  return (
    <button className={`chip clickable sat-chip ${satClass(sharing)}`} onClick={openSharingSettings} title={satTitle(sharing, dark.map((d) => d.name))}>
      {satText(sharing, Date.now())}
    </button>
  );
}

/** POST a control to the sharing route and adopt the state it answers with. */
async function postSharing(path: string, body?: unknown): Promise<SharingState | undefined> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  if (!res.ok) return undefined;
  const next = (await res.json()) as SharingState;
  useSharing.getState().set(next);
  return next;
}

interface HubTowers { towers?: string[]; error?: string }

/**
 * The hub's list of tower names. It is read again whenever the set of share names changes, so a tower shared
 * after the section opened is not reported as missing. Until the answer for the current names arrives, nothing is
 * known, so the rows do not claim "missing on the hub" from an older list.
 */
function useHubTowers(names: string[]): HubTowers {
  const key = [...names].sort().join(',');
  const [hub, setHub] = useState<HubTowers & { key?: string }>({});
  useEffect(() => {
    if (STATIC) return;
    let live = true;
    fetch('/api/sharing/towers?hub=1')
      .then((r) => r.json() as Promise<{ hub?: { ok: boolean; towers?: string[]; error?: string } }>)
      .then((body) => { if (live && body.hub) setHub(body.hub.ok ? { key, towers: body.hub.towers ?? [] } : { key, error: body.hub.error }); })
      .catch(() => { if (live) setHub({ key, error: 'cannot reach the hub' }); });
    return () => { live = false; };
  }, [key]);
  return hub.key === key ? hub : {};
}

/**
 * One shared tower of the Settings list. The unshare error stays on its row; when the hub could not be reached
 * the row also offers the forced removal, which drops the share from this config only.
 */
function SharedTowerRow({ share, hubNames, now }: { share: TowerShare; hubNames?: string[]; now: number }) {
  const [failed, setFailed] = useState<ActionFailure>();
  const [busy, setBusy] = useState(false);
  const status = shareStatus(share, now);
  const missing = hubNames !== undefined && !hubNames.includes(share.name);
  const unshare = (force: boolean) => {
    // A forced removal runs when the hub is down, so it must not claim the hub removes its copy.
    const question = force
      ? `Remove ${share.name} from this machine only? The hub cannot be reached, so it keeps its copy until you unshare it there.`
      : `Stop sharing ${share.name} with the hub? The hub removes its copy.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setFailed(undefined);
    void unshareTower(share.name, force)
      .then((f) => setFailed(f))
      .finally(() => setBusy(false));
  };
  // Only a hub that cannot be reached can be bypassed: a refusal means the hub is up and must be answered.
  const unreachable = failed?.unreachable === true;
  const error = failed?.error;
  return (
    <li className="sharing-row">
      <span className="sharing-name">{share.name}</span>
      <span className="sharing-dir dim" title={share.dir}>{share.dir}</span>
      <span className="dim">{share.files ? 'YAML and referenced files' : 'YAML only'}</span>
      <span className={status.tone} title={status.title}>{status.text}</span>
      {missing && <span className="warn">missing on the hub</span>}
      {share.warning && <div className="sharing-warn">{share.warning}</div>}
      <button className="btn" disabled={busy} onClick={() => unshare(false)}>Unshare</button>
      {unreachable && <button className="btn" disabled={busy} onClick={() => unshare(true)} title="Drop the share from this machine only; the hub keeps its copy">Remove from config only</button>}
      {error && (unreachable
        // The server text ends with a CLI hint for a --force flag this UI does not have, so show our own wording
        // and keep the server text in the title for anyone who wants the full message.
        ? <span className="err" role="alert" title={error}>{`The hub cannot be reached: ${share.name} stays shared. "Remove from config only" drops it from this machine; the hub keeps its copy.`}</span>
        : <span className="err" role="alert">{error}</span>)}
    </li>
  );
}

/**
 * One dark project of the Settings block. Sharing it is the fix, so the button stays here; a failure stays on this line.
 */
function DarkProjectRow({ project }: { project: DarkProject }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const share = () => {
    setBusy(true);
    setError(undefined);
    void shareProject(project.id, false)
      .then((f) => setError(f?.error))
      .finally(() => setBusy(false));
  };
  return (
    <li className="sharing-row">
      <span className="sharing-name">{project.name}</span>
      <button className="btn" disabled={busy} onClick={share}>Share towers</button>
      {error && <span className="err" role="alert">{error}</span>}
    </li>
  );
}

/** Settings section: what a satellite sends, what it never sends, and the two local controls. */
export function SharingSection() {
  const sharing = useSharing((s) => s.sharing);
  const shares = useSharing((s) => s.shares);
  const dark = useSharing((s) => s.dark);
  const hub = useHubTowers(shares.map((s) => s.name));
  const [test, setTest] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Settings may open before the first poll ever ran (or after a long idle): refresh on mount.
  useEffect(() => { if (!STATIC) void refreshSharing(); }, []);
  if (sharing.state === 'off') return null;

  const pause = (paused: boolean) => void postSharing('/api/sharing', { paused });
  const runTest = () => {
    setBusy(true);
    void postSharing('/api/sharing/test')
      .then((s) => setTest(s ? `Last test: ${s.state}${s.lastError ? ` — ${s.lastError}` : ''}` : 'Last test failed'))
      .finally(() => setBusy(false));
  };

  // The wording follows the state; queueText keeps that rule in one place so it can be unit-tested.
  const queue = queueText(sharing);
  return (
    <section id="settings-sharing">
      <h3>Sharing</h3>
      <Row label="Hub" hint="The satellite relay of this machine sends metadata here.">
        <span className="mono dim">{sharing.hub ?? '—'}</span>
      </Row>
      <Row label="Token" hint="Whether the hub accepts this machine's credential. The token itself is never shown.">
        <span className={`chip ${sharing.state === 'revoked' ? 'err' : sharing.state === 'held' ? 'warn' : 'on'}`}>
          {sharing.state === 'revoked' ? 'refused' : sharing.state === 'held' ? 'paused by the hub' : 'accepted'}
        </span>
      </Row>
      <Row label="Last sent" hint="The last event that actually left this machine.">
        <span className="mono dim">{agoText(sharing.lastSentAt, Date.now())}</span>
      </Row>
      <Row label="Queue" hint="Bounded in-memory queue: the oldest events are dropped first while the hub is unreachable.">
        <span className="mono dim">{queue}</span>
      </Row>
      <Row label="What is shared" hint="Content-free metadata: it describes the run, never what was said.">
        <span className="sharing-list">event kind, time, tool, agent and node names, model, tokens, cost, duration, status, user, machine, project</span>
      </Row>
      <Row label="Never shared" hint="Prompt text, messages, commands and tool input or output never leave this machine.">
        <span className="sharing-list">prompts, messages, commands, file contents, tool input and output</span>
      </Row>
      <Row label="Pause sharing" hint="Stops the relay now and after a restart: nothing is queued to leave later behind your back.">
        <Toggle on={sharing.state === 'paused'} onChange={pause} />
      </Row>
      <Row label="Send a test event" hint={test ?? "One minimal event, flushed now, so the hub's answer is immediate."}>
        <button className="btn" onClick={runTest} disabled={busy} title="Send one minimal event to the hub and show what it answered">{busy ? 'Sending…' : 'Send test'}</button>
      </Row>
      {dark.length > 0 && (
        <div className="sharing-dark">
          <p>Active here but dark on the hub: the hub lights only the towers this machine shared.</p>
          <ul className="sharing-towers">
            {dark.map((d) => <DarkProjectRow key={d.id} project={d} />)}
          </ul>
        </div>
      )}
      {shares.length > 0 && (
        <>
          <h3>Shared towers</h3>
          {/* One row per share: where it comes from, what it sends, and whether the hub still has it. */}
          <ul className="sharing-towers">
            {shares.map((s) => <SharedTowerRow key={s.name} share={s} hubNames={hub.towers} now={Date.now()} />)}
          </ul>
        </>
      )}
      {sharing.lastPayload && (
        <>
          <h3>Last payload</h3>
          <pre className="sharing-pre" tabIndex={0} aria-label="Last payload sent to the hub">{JSON.stringify(sharing.lastPayload, null, 2)}</pre>
        </>
      )}
    </section>
  );
}
