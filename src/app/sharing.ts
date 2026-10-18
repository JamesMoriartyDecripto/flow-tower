/**
 * Pure formatting for the satellite sharing chip and section (#91). Kept free of React and of the app
 * store so it can be unit-tested without a DOM: the UI in hud/Sharing.tsx imports these.
 */

/** One shared tower as GET /api/sharing/towers lists it (#266). `projects` are the library ids in its folder. */
export interface TowerShare {
  name: string;
  dir: string;
  files: boolean;
  projects: string[];
  syncedAt?: number;
  error?: string;
  warning?: string;
}

/** The share that holds a project's folder, if this machine shares it. */
export function shareOf(shares: TowerShare[], projectId: string): TowerShare | undefined {
  return shares.find((s) => s.projects.includes(projectId));
}

/** What a share sends: the tower files only, or the tower files and the files they reference. */
export function shareMode(share?: TowerShare): 'off' | 'towers' | 'files' {
  if (!share) return 'off';
  return share.files ? 'files' : 'towers';
}

/**
 * The status of one share. An error wins over an earlier sync: the last try is what the user needs to see.
 * No sync and no error yet means the first send is still on its way.
 */
export function shareStatus(share: TowerShare, now: number): { text: string; tone: 'on' | 'err' | 'dim'; title: string } {
  if (share.error) return { text: 'not sent', tone: 'err', title: share.error };
  if (share.syncedAt !== undefined) return { text: `on the hub · ${agoText(share.syncedAt, now)}`, tone: 'on', title: `${share.name} is on the hub` };
  return { text: 'sending…', tone: 'dim', title: `${share.name} has not reached the hub yet` };
}

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
  towers?: { name: string; syncedAt?: number; error?: string; warning?: string }[];
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

/** The shared towers the hub did not accept on the last sync, in the order the sync lists them. */
export function unsentTowers(s: SharingState): { name: string; error: string }[] {
  return (s.towers ?? []).flatMap((t) => (t.error ? [{ name: t.name, error: t.error }] : []));
}

/**
 * One line per shared tower of the Settings section. A tower with an error reads as not sent, with the full
 * error in the title (the line itself may be cut short by the layout); otherwise it shows when it last synced.
 */
export function towerLine(t: { name: string; syncedAt?: number; error?: string }, now: number): { text: string; tone: 'on' | 'err'; title: string } {
  if (t.error) return { text: `${t.name} · not sent: ${t.error}`, tone: 'err', title: t.error };
  return { text: `${t.name} · on the hub · ${agoText(t.syncedAt, now)}`, tone: 'on', title: `${t.name} is on the hub` };
}

/** The chip suffix for failed shares: the count names how many towers are waiting, not which ones. */
export function unsentSuffix(s: SharingState): string {
  const n = unsentTowers(s).length;
  if (n === 0) return '';
  return n === 1 ? ' · 1 tower not sent' : ` · ${n} towers not sent`;
}

/** The chip label: hub and last send, plus the state word that matters right now. */
export function satText(s: SharingState, now: number): string {
  const base = `SAT → ${hubHost(s.hub)} · ${agoText(s.lastSentAt, now)}`;
  const withState = (() => {
    if (s.state === 'queued') return `${base} · ${s.queued ?? 0} queued`;
    if (s.state === 'paused') return `${base} · paused`;
    if (s.state === 'revoked') return `${base} · token refused`;
    if (s.state === 'held') return `${base} · paused by the hub`;
    return base;
  })();
  return `${withState}${unsentSuffix(s)}`;
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

/**
 * The chip class. A failed tower share turns an otherwise healthy chip to warn, but never hides a worse
 * state: revoked, paused and held keep their own colour.
 */
export function satClass(s: SharingState): string {
  if (s.state === 'online' && unsentTowers(s).length > 0) return 'warn';
  return SAT_CLASS[s.state];
}

/** One sentence explaining the state on hover; a failed share adds the names and the first error. */
export function satTitle(s: SharingState): string {
  const host = hubHost(s.hub);
  const base = satBaseTitle(s, host);
  const unsent = unsentTowers(s);
  if (unsent.length === 0) return base;
  const names = unsent.map((t) => t.name).join(', ');
  return `${base} Not sent: ${names}. First error: ${unsent[0].error}`;
}

function satBaseTitle(s: SharingState, host: string): string {
  if (s.state === 'queued') return `Sharing with ${host}: the hub is unreachable, ${s.queued ?? 0} event(s) wait in the queue. Click for the sharing settings.`;
  if (s.state === 'paused') return `Sharing is paused: nothing leaves this machine for ${host} until you resume it. Click for the sharing settings.`;
  if (s.state === 'held') return `Sharing waits: ${host} paused this machine. It resumes by itself when the hub owner resumes it.`;
  if (s.state === 'revoked') return `Sharing stopped: ${host} refused this machine's token, so no event is sent. Click for the sharing settings.`;
  return `Sharing with ${host}: this machine's metadata reaches the hub. Click for the sharing settings.`;
}
