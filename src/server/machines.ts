/**
 * The Machines rows of the Hub panel (#92): one row per sender the hub knows, built from the token list
 * and the satellite registry. Pure (no fs, no http) so the UI can be reasoned about without a server.
 * Metadata only: a row carries the sender id, a shortened token label and what the satellite reported,
 * never a token plaintext, a prompt, a message or a path.
 */
import type { TokenInfo } from './tokens.ts';
import type { SatelliteView } from './satellites.ts';

/** A row is "online" within this window: the HUB n/m counter uses the same 5 minutes. */
export const RECENT_MS = 300_000;

export interface MachineRow {
  sender: string;
  /** "ft_<id>…" at most: enough to tell rows apart, never a usable credential. */
  token: string;
  runtime?: string;
  host?: string;
  /** Last time we heard from this sender: the newer of a heartbeat and an accepted event. */
  lastSeen?: number;
  queued?: number;
  state: 'active' | 'paused' | 'revoked' | 'unknown';
  online: boolean;
}

/** The display form of a token: the id says which sender, the secret stays out of the UI entirely. */
const tokenLabel = (id: string) => `ft_${id}…`;

/** State of a token row: revoked beats paused, since a revoked token can never be resumed. */
const tokenState = (t: TokenInfo): MachineRow['state'] =>
  t.revokedAt !== undefined ? 'revoked' : t.paused ? 'paused' : 'active';

/** The newer of the two timestamps a sender may have, or undefined when we have never heard from it. */
const newest = (...at: (number | undefined)[]) => {
  const set = at.filter((v): v is number => v !== undefined);
  return set.length ? Math.max(...set) : undefined;
};

/**
 * One row per token, plus one per satellite sender that has no token: a sender known only from events
 * (the legacy 'default' included) is real, just unauthenticated, so it shows as `unknown` with no token.
 */
export function machineRows(tokens: TokenInfo[], sats: SatelliteView[], now: number): MachineRow[] {
  const bySender = new Map(sats.map((s) => [s.sender, s]));
  const rows: MachineRow[] = tokens.map((t) => {
    const sat = bySender.get(t.id);
    const lastSeen = newest(sat?.lastSeen, sat?.lastEventAt);
    return {
      sender: t.id,
      token: tokenLabel(t.id),
      ...(sat?.runtime === undefined ? {} : { runtime: sat.runtime }),
      ...(sat?.host === undefined ? {} : { host: sat.host }),
      ...(lastSeen === undefined ? {} : { lastSeen }),
      ...(sat === undefined ? {} : { queued: sat.queued }),
      state: tokenState(t),
      online: lastSeen !== undefined && now - lastSeen < RECENT_MS,
    };
  });
  const known = new Set(tokens.map((t) => t.id));
  for (const sat of sats) {
    if (known.has(sat.sender)) continue;
    const lastSeen = newest(sat.lastSeen, sat.lastEventAt);
    rows.push({
      sender: sat.sender,
      token: '',
      ...(sat.runtime === undefined ? {} : { runtime: sat.runtime }),
      ...(sat.host === undefined ? {} : { host: sat.host }),
      ...(lastSeen === undefined ? {} : { lastSeen }),
      queued: sat.queued,
      state: 'unknown',
      online: lastSeen !== undefined && now - lastSeen < RECENT_MS,
    });
  }
  // Online first, then the most recently seen, then by sender: a stable order the UI can page over.
  return rows.sort((a, b) =>
    Number(b.online) - Number(a.online) ||
    (b.lastSeen ?? 0) - (a.lastSeen ?? 0) ||
    a.sender.localeCompare(b.sender));
}

/**
 * The HUB panel's counters: how many senders are online, out of how many active tokens exist. A revoked
 * token can still have a recent lastSeen, so the online side skips revoked rows too, or "HUB 3/2" happens.
 * Tokenless satellites (state unknown) still count as online: they are real senders, just unauthenticated.
 */
export function hubCounts(rows: MachineRow[]): { online: number; tokens: number } {
  return {
    online: rows.filter((r) => r.online && r.state !== 'revoked').length,
    tokens: rows.filter((r) => r.state === 'active').length,
  };
}
