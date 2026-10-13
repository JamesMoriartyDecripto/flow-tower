/**
 * Satellite heartbeats (#91): the hub remembers, per sender, when it last heard from a satellite and what
 * that satellite's relay reported. Metadata only: a heartbeat carries counters and a state word, never
 * events, prompts or tokens. Kept in memory like the event buffer: a restart simply forgets the list.
 */
import { z } from 'zod';
import { clip } from '../core/adapters.ts';

/** How long a satellite counts as online without a heartbeat: three missed beats of one minute. */
export const ONLINE_MS = 180_000;

/** Longest runtime/host kept here (#92): they are labels for the Machines rows, not a data channel. */
export const NAME_MAX = 64;

/** The body of POST /api/heartbeat: the counters and state word the relay publishes, nothing else. */
/** Most shared towers a satellite may flag in one heartbeat: a bound on what the hub keeps per sender. */
export const SHARE_FLAGS_MAX = 100;

/**
 * A shared tower's folder name as the satellite sends it. Limited to the folder-name alphabet, so the name
 * is safe to match against `towers/<sender>/<name>/` and can never carry free text.
 */
const ShareNameSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
const ShareFlagSchema = z.object({ name: ShareNameSchema, error: z.literal(true) });

export const HeartbeatSchema = z.object({
  queued: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  state: z.string().min(1),
  version: z.string().min(1).optional(),
  /** Shared towers whose last sync failed (#190): only the name and a flag, never the error text. */
  shares: z.array(ShareFlagSchema).max(SHARE_FLAGS_MAX).optional(),
});

export type Heartbeat = z.infer<typeof HeartbeatSchema>;

/**
 * Keeps the valid share flags of a raw heartbeat body and drops the rest, so one bad entry (or too many)
 * never costs the whole heartbeat its counters. Run it before HeartbeatSchema. A flag is metadata only:
 * losing a bad one just means that share is not flagged, which the next heartbeat corrects.
 */
export function keepValidShares(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('shares' in body)) return body;
  const raw = (body as { shares: unknown }).shares;
  const shares = Array.isArray(raw)
    ? raw.filter((s) => ShareFlagSchema.safeParse(s).success).slice(0, SHARE_FLAGS_MAX)
    : [];
  return { ...body, shares };
}

export interface SatelliteView {
  sender: string;
  lastSeen?: number;
  lastEventAt?: number;
  /** Agent runtime and machine the sender last reported (#92): metadata for the Machines rows. */
  runtime?: string;
  host?: string;
  queued: number;
  dropped: number;
  state: string;
  version?: string;
  /** Names of the shared towers whose last sync failed: the hub keeps the last valid copy of each. */
  flagged?: string[];
  online: boolean;
}

/**
 * The hub's satellite registry. `now` is injectable so tests can age a heartbeat past the online window
 * with a fake clock instead of waiting three minutes.
 */
export function createSatellites(now: () => number = Date.now) {
  const seen = new Map<string, Omit<SatelliteView, 'online'>>();

  /**
   * Runtime/host of a report, clipped and dropped when empty: the last non-empty value wins, because a
   * bare event (a heartbeat or a source that omits them) must not erase what an earlier one told us.
   */
  const names = (e?: { runtime?: string; host?: string }, prev?: Omit<SatelliteView, 'online'>) => {
    const runtime = clip(e?.runtime?.trim() || undefined, NAME_MAX) ?? prev?.runtime;
    const host = clip(e?.host?.trim() || undefined, NAME_MAX) ?? prev?.host;
    return { ...(runtime === undefined ? {} : { runtime }), ...(host === undefined ? {} : { host }) };
  };

  /** A heartbeat from `sender`: it refreshes lastSeen and replaces the counters it reported. */
  const beat = (sender: string, hb: Heartbeat) => {
    const prev = seen.get(sender);
    seen.set(sender, {
      sender,
      lastSeen: now(),
      ...(prev?.lastEventAt !== undefined ? { lastEventAt: prev.lastEventAt } : {}),
      ...names(undefined, prev),
      queued: hb.queued,
      dropped: hb.dropped,
      state: hb.state,
      ...(hb.version !== undefined ? { version: hb.version } : {}),
      // Replaced, not merged: a heartbeat without `shares` means the flags are gone, so a stale one clears itself.
      ...(hb.shares !== undefined ? { flagged: [...new Set(hb.shares.map((s) => s.name))] } : {}),
    });
  };

  /** An accepted event is proof of life too: a satellite that only pushes events stays visible. */
  const touch = (sender: string, e?: { runtime?: string; host?: string }) => {
    const at = now();
    const prev = seen.get(sender);
    if (prev) {
      prev.lastEventAt = at;
      Object.assign(prev, names(e, prev));
    } else {
      // A sender we only know from events has no heartbeat yet: online stays false until one arrives.
      seen.set(sender, { sender, lastEventAt: at, ...names(e), queued: 0, dropped: 0, state: 'unknown' });
    }
  };

  /** The list the UI reads: never a token, only the sender id and what it reported. */
  const list = (): SatelliteView[] =>
    [...seen.values()].map((s) => ({
      ...s,
      online: s.lastSeen !== undefined && now() - s.lastSeen < ONLINE_MS,
    }));

  return { beat, touch, list };
}

export type Satellites = ReturnType<typeof createSatellites>;
