import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { STATIC } from '../staticData';
import { agoText, queueText, SAT_CLASS, satText, satTitle, SHARING_OFF, type SharingState } from '../sharing';
import { usePrefs } from '../settings';
import { Row, Toggle } from './Settings';

const POLL_MS = 5000;

async function getSharing(): Promise<SharingState> {
  const res = await fetch('/api/sharing');
  if (!res.ok) return SHARING_OFF;
  return (await res.json()) as SharingState;
}

/** One shared store: the chip polls it, the Settings section reads it and updates it after each action. */
const useSharing = create<{ sharing: SharingState; set(sharing: SharingState): void }>()((set) => ({
  sharing: SHARING_OFF,
  set: (sharing) => set({ sharing }),
}));

/** Fetch the state once and put it in the store (also after a pause or a test, to show the result). */
export function refreshSharing(): Promise<void> {
  return getSharing().then((s) => useSharing.getState().set(s)).catch(() => {});
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
  if (sharing.state === 'off') return null;
  return (
    <button className={`chip clickable sat-chip ${SAT_CLASS[sharing.state]}`} onClick={openSharingSettings} title={satTitle(sharing)}>
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

/** Settings section: what a satellite sends, what it never sends, and the two local controls. */
export function SharingSection() {
  const sharing = useSharing((s) => s.sharing);
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
      {sharing.lastPayload && (
        <>
          <h3>Last payload</h3>
          <pre className="sharing-pre" tabIndex={0} aria-label="Last payload sent to the hub">{JSON.stringify(sharing.lastPayload, null, 2)}</pre>
        </>
      )}
    </section>
  );
}
