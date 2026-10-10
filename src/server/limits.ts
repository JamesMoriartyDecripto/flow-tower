/**
 * Abuse limits for a shared event hub (#83, phase 3). A hub on a tailnet or the internet takes events
 * from other machines, so a single sender must not be able to flood it, replay the same event forever,
 * or backdate an event to rewrite history. Everything here is pure in-memory state: a hub restart
 * forgets it, which is fine for a dev server, and nothing is written next to the user's files.
 */

/** Window around "now" an event timestamp may sit in: older forks and skewed clocks are dropped. */
export const TS_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface Bucket {
  /** Spend `n` tokens for `key`. False when the bucket is empty: the caller answers 429. */
  take(key: string, n?: number): boolean;
  /** Whole seconds until `key` has one token again, for Retry-After (never below 1). */
  retryAfter(key: string): number;
}

export interface BucketOptions {
  /** Tokens refilled per second (default 20 events/s). */
  rate?: number;
  /** Bucket size: how much a sender may spend at once (default 200). */
  burst?: number;
  /** Injectable clock (tests): epoch milliseconds. */
  now?: () => number;
}

/**
 * Per-sender token bucket. Tokens refill continuously at `rate`, capped at `burst`, so a steady
 * sender is never refused while a sudden flood is. State is per key and never leaks across senders.
 */
export function createBucket({ rate = 20, burst = 200, now = Date.now }: BucketOptions = {}): Bucket {
  const state = new Map<string, { tokens: number; at: number }>();

  const refill = (key: string) => {
    const at = now();
    const s = state.get(key) ?? { tokens: burst, at };
    s.tokens = Math.min(burst, s.tokens + (Math.max(0, at - s.at) / 1000) * rate);
    s.at = at;
    return s;
  };

  return {
    take(key, n = 1) {
      const s = refill(key);
      if (s.tokens < n) return false;
      s.tokens -= n;
      state.set(key, s);
      return true;
    },
    retryAfter(key) {
      const s = state.get(key) ?? { tokens: burst, at: now() };
      const missing = Math.max(0, 1 - s.tokens);
      return Math.max(1, Math.ceil(missing / rate));
    },
  };
}

export interface Dedupe {
  /** True when this key was already taken (and refreshes it as most recently used). */
  seen(key: string): boolean;
}

/**
 * LRU of event keys, so a sender re-sending the same event (a retrying hook, a replayed log) is
 * dropped once and only for a while: the oldest key is evicted past `max`, keeping the memory bounded.
 */
export function createDedupe(max = 50_000): Dedupe {
  const seen = new Map<string, true>();
  return {
    seen(key) {
      if (seen.has(key)) {
        // Re-insert to move it to the young end of the Map: insertion order is our LRU order.
        seen.delete(key);
        seen.set(key, true);
        return true;
      }
      seen.set(key, true);
      if (seen.size > max) seen.delete(seen.keys().next().value as string);
      return false;
    },
  };
}

const asObject = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

/**
 * Stable id of an event, for dedupe. Sources that carry their own id win (OTLP `request_id`, a tool
 * call id), then an explicit `event_id`. Events without any id cannot be deduped and are always kept.
 */
export function eventIdOf(item: unknown): string | undefined {
  const e = asObject(item);
  if (!e) return undefined;
  const data = asObject(e.data);
  for (const candidate of [data?.request_id, data?.call, e.call, e.event_id]) {
    if (typeof candidate === 'string' && candidate) return candidate;
    if (typeof candidate === 'number') return String(candidate);
  }
  return undefined;
}

/** Did this event live in the last TS_WINDOW_MS? A missing ts is fine: the server fills it in as now. */
export function inTimeWindow(ts: number | undefined, at: number): boolean {
  return ts === undefined || Math.abs(at - ts) <= TS_WINDOW_MS;
}
