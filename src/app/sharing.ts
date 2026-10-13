/**
 * Pure formatting for the satellite sharing chip and section (#91). Kept free of React and of the app
 * store so it can be unit-tested without a DOM: the UI in hud/Sharing.tsx imports these.
 */

/** The relay state a satellite reports on GET /api/sharing (#91). 'off' = this server is not a satellite. */
export interface SharingState {
  state: 'off' | 'online' | 'queued' | 'revoked' | 'held' | 'paused';
  hub?: string;
  queued?: number;
  dropped?: number;
  lastSentAt?: number;
  lastError?: string;
  lastPayload?: Record<string, unknown>;
  /** The shared towers and when each last synced (#164), present when the sync loop runs. */
  towers?: { name: string; syncedAt?: number; error?: string }[];
}

export const SHARING_OFF: SharingState = { state: 'off' };

/** Just the host, so the chip stays short: the scheme and any trailing slash carry no information here. */
export function hubHost(hub?: string): string {
  if (!hub) return 'hub';
  return hub.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** Seconds under a minute (the relay is polled every 5 s, so a coarse label is enough), then min / h. */
export function agoText(at: number | undefined, now: number): string {
  if (at === undefined) return 'never';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(at).toLocaleDateString();
}

/** The chip label: hub and last send, plus the state word that matters right now. */
export function satText(s: SharingState, now: number): string {
  const base = `SAT → ${hubHost(s.hub)} · ${agoText(s.lastSentAt, now)}`;
  if (s.state === 'queued') return `${base} · ${s.queued ?? 0} queued`;
  if (s.state === 'paused') return `${base} · paused`;
  if (s.state === 'revoked') return `${base} · token refused`;
  if (s.state === 'held') return `${base} · paused by the hub`;
  return base;
}

/**
 * The Queue row of the sharing section (#91): events merely waiting for the next flush are "waiting to
 * send", while "queued" means the hub is unreachable and they pile up. Dropped events are always worth
 * naming, whatever the state.
 */
export function queueText(s: SharingState): string {
  const n = s.queued ?? 0;
  const waiting = `${n} ${s.state === 'queued' ? 'queued while the hub is unreachable' : 'waiting to send'}`;
  return s.dropped ? `${waiting}, ${s.dropped} dropped` : waiting;
}

/** Reuse the existing chip variants: only the state word changes, never a new colour. */
export const SAT_CLASS: Record<SharingState['state'], string> = {
  off: '', online: 'on', queued: 'warn', held: 'warn', paused: 'dim', revoked: 'err',
};

/** One sentence explaining the state on hover. */
export function satTitle(s: SharingState): string {
  const host = hubHost(s.hub);
  if (s.state === 'queued') return `Sharing with ${host}: the hub is unreachable, ${s.queued ?? 0} event(s) wait in the queue. Click for the sharing settings.`;
  if (s.state === 'paused') return `Sharing is paused: nothing leaves this machine for ${host} until you resume it. Click for the sharing settings.`;
  if (s.state === 'held') return `Sharing waits: ${host} paused this machine. It resumes by itself when the hub owner resumes it.`;
  if (s.state === 'revoked') return `Sharing stopped: ${host} refused this machine's token, so no event is sent. Click for the sharing settings.`;
  return `Sharing with ${host}: this machine's metadata reaches the hub. Click for the sharing settings.`;
}
