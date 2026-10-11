/**
 * Satellite heartbeats (#91): the hub remembers, per sender, when it last heard from a satellite and what
 * that satellite's relay reported. Metadata only: a heartbeat carries counters and a state word, never
 * events, prompts or tokens. Kept in memory like the event buffer: a restart simply forgets the list.
 */
import { z } from 'zod';

/** How long a satellite counts as online without a heartbeat: three missed beats of one minute. */
export const ONLINE_MS = 180_000;

/** The body of POST /api/heartbeat: the counters and state word the relay publishes, nothing else. */
export const HeartbeatSchema = z.object({
  queued: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  state: z.string().min(1),
  version: z.string().min(1).optional(),
});

export type Heartbeat = z.infer<typeof HeartbeatSchema>;

export interface SatelliteView {
  sender: string;
  lastSeen?: number;
  lastEventAt?: number;
  queued: number;
  dropped: number;
  state: string;
  version?: string;
  online: boolean;
}

/**
 * The hub's satellite registry. `now` is injectable so tests can age a heartbeat past the online window
 * with a fake clock instead of waiting three minutes.
 */
export function createSatellites(now: () => number = Date.now) {
  const seen = new Map<string, Omit<SatelliteView, 'online'>>();

  /** A heartbeat from `sender`: it refreshes lastSeen and replaces the counters it reported. */
  const beat = (sender: string, hb: Heartbeat) => {
    const prev = seen.get(sender);
    seen.set(sender, {
      sender,
      lastSeen: now(),
      ...(prev?.lastEventAt !== undefined ? { lastEventAt: prev.lastEventAt } : {}),
      queued: hb.queued,
      dropped: hb.dropped,
      state: hb.state,
      ...(hb.version !== undefined ? { version: hb.version } : {}),
    });
  };

  /** An accepted event is proof of life too: a satellite that only pushes events stays visible. */
  const touch = (sender: string) => {
    const at = now();
    const prev = seen.get(sender);
    if (prev) prev.lastEventAt = at;
    // A sender we only know from events has no heartbeat yet: online stays false until one arrives.
    else seen.set(sender, { sender, lastEventAt: at, queued: 0, dropped: 0, state: 'unknown' });
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
